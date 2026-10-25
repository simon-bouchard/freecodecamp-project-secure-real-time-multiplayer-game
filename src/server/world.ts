import { randomUUID } from 'node:crypto';
import {
	BIG_COIN_DELAY_TICKS,
	BIG_COIN_LIFETIME_TICKS,
	BIG_COIN_RADIUS,
	BIG_COIN_VALUE,
	COIN_RADIUS,
	COIN_SPAWN_ATTEMPTS,
	INPUT_RATE_TOLERANCE,
	MAX_INPUT_CREDITS,
	MAX_PLAYERS,
	MAX_QUEUED_INPUTS,
	PALETTE,
	PLAYER_RADIUS,
	RESULTS_TICKS,
	ROUND_TICKS,
	TICK_DT,
	TICK_MS,
} from '../shared/constants.js';
import {
	type Circle,
	circlesOverlap,
	movePlayer,
	normalizeName,
	pickCoinSpawn,
	pickSpawn,
	randomPointInArena,
} from '../shared/game.js';
import type {
	CoinState,
	InputMessage,
	JoinRequest,
	JoinResult,
	PlayerState,
	RoundPhase,
	Snapshot,
	Vec,
} from '../shared/protocol.js';

/** A collectible with a remaining lifetime in ticks. */
interface TimedPickup {
	id: number;
	x: number;
	y: number;
	ticksLeft: number;
}

interface PlayerEntry {
	state: PlayerState;
	queue: InputMessage[];
	credits: number;
	highestSeq: number;
	token: string;
}

/** Authoritative game state. Advance it with `step()`, once per server tick. */
export class World {
	private readonly players = new Map<string, PlayerEntry>();
	private coin: CoinState;
	private tick = 0;
	private roundPhase: RoundPhase = 'waiting';
	private ticksLeft = 0;
	private winners: string[] = [];
	private bigCoin: TimedPickup | null = null;
	private nextBigCoinTimer = 0;
	private bigCoinIds = 0;

	constructor(
		private readonly rng: () => number = Math.random,
		private readonly newToken: () => string = randomUUID,
	) {
		this.coin = { id: 1, ...pickCoinSpawn([], rng) };
	}

	get phase(): RoundPhase {
		return this.roundPhase;
	}

	/** Add a player with no checks; the first player into an empty game starts a round. */
	addPlayer(id: string, name = id, color = this.freeColor()): PlayerState {
		const pos = this.playerSpawn();
		const state: PlayerState = {
			id,
			name,
			color,
			x: pos.x,
			y: pos.y,
			score: 0,
			lastSeq: 0,
			effects: [],
		};
		const entry = { state, queue: [], credits: MAX_INPUT_CREDITS, highestSeq: 0, token: '' };
		this.players.set(id, entry);
		if (this.roundPhase === 'waiting') {
			this.startRound();
		}
		return { ...state };
	}

	/** Join as a new player, or take back the player that owns `req.token` after a reconnect. */
	join(id: string, req: JoinRequest): JoinResult {
		const name = normalizeName(req.name);
		if (this.players.has(id) || name === null) {
			return { ok: false, reason: 'invalid' };
		}

		const previous = req.token ? this.findByToken(req.token) : undefined;
		if (previous) {
			this.handOver(previous, id);
			return { ok: true, token: previous.token };
		}

		if (!PALETTE.includes(req.color)) {
			return { ok: false, reason: 'unknown-color' };
		}
		if (this.players.size >= MAX_PLAYERS) {
			return { ok: false, reason: 'full' };
		}
		if ([...this.players.values()].some((e) => e.state.color === req.color)) {
			return { ok: false, reason: 'color-taken' };
		}
		this.addPlayer(id, name, req.color);
		const token = this.newToken();
		this.players.get(id)!.token = token;
		return { ok: true, token };
	}

	removePlayer(id: string): void {
		this.players.delete(id);
	}

	/** Queue a validated input; stale seqs are ignored and overflow drops the oldest. */
	queueInput(id: string, msg: InputMessage): void {
		const entry = this.players.get(id);
		if (!entry || msg.seq <= entry.highestSeq) {
			return;
		}
		entry.highestSeq = msg.seq;
		const { up, down, left, right } = msg.input;
		entry.queue.push({ seq: msg.seq, input: { up, down, left, right } });
		if (entry.queue.length > MAX_QUEUED_INPUTS) {
			entry.queue.shift();
		}
	}

	/** Test hook: inputs queued for a player but not applied yet. */
	pendingInputs(id: string): readonly InputMessage[] {
		return this.players.get(id)?.queue ?? [];
	}

	/** Advance one tick of the current round phase. */
	step(): void {
		if (this.players.size === 0) {
			this.roundPhase = 'waiting';
			this.clearExtras();
		}

		if (this.roundPhase === 'playing') {
			this.applyInputs();
			this.updateBigCoin();
			this.collectCoin();
			this.collectBigCoin();
			if (--this.ticksLeft <= 0) {
				this.endRound();
			}
		} else if (this.roundPhase === 'results') {
			this.discardInputs();
			if (--this.ticksLeft <= 0) {
				this.respawnCoin();
				this.startRound();
			}
		}

		this.tick++;
	}

	/** Copy of the current state for broadcasting; `time` is the server clock in ms. */
	snapshot(time: number): Snapshot {
		return {
			tick: this.tick,
			time,
			players: [...this.players.values()].map((e) => ({ ...e.state, effects: [] })),
			coin: { ...this.coin },
			bigCoin: this.bigCoin && {
				id: this.bigCoin.id,
				x: this.bigCoin.x,
				y: this.bigCoin.y,
				expiresAt: time + this.bigCoin.ticksLeft * TICK_MS,
			},
			item: null,
			round: {
				phase: this.roundPhase,
				endsAt: this.roundPhase === 'waiting' ? null : time + this.ticksLeft * TICK_MS,
				winners: [...this.winners],
			},
		};
	}

	/** Test hook: teleport a player. */
	setPlayerPosition(id: string, pos: Vec): void {
		const entry = this.players.get(id);
		if (entry) {
			entry.state.x = pos.x;
			entry.state.y = pos.y;
		}
	}

	/** Test hook: move the current coin without changing its id. */
	setCoinPosition(pos: Vec): void {
		this.coin = { ...this.coin, x: pos.x, y: pos.y };
	}

	/** Test hook: ticks until the next big coin spawns (0 while one is on the board). */
	get bigCoinTimer(): number {
		return this.bigCoin ? 0 : this.nextBigCoinTimer;
	}

	/** Test hook: place a fresh big coin, or remove it with null. */
	setBigCoin(pos: Vec | null): void {
		this.bigCoin = pos && { id: ++this.bigCoinIds, ...pos, ticksLeft: BIG_COIN_LIFETIME_TICKS };
	}

	/** Test hook: set a player's score. */
	setScore(id: string, score: number): void {
		const entry = this.players.get(id);
		if (entry) {
			entry.state.score = score;
		}
	}

	private applyInputs(): void {
		for (const entry of this.players.values()) {
			entry.credits = Math.min(entry.credits + INPUT_RATE_TOLERANCE, MAX_INPUT_CREDITS);
			while (entry.credits >= 1 && entry.queue.length > 0) {
				const msg = entry.queue.shift()!;
				const pos = movePlayer(entry.state, msg.input, TICK_DT);
				entry.state.x = pos.x;
				entry.state.y = pos.y;
				entry.state.lastSeq = msg.seq;
				entry.credits--;
			}
		}
	}

	/** Acknowledge queued inputs without moving, so client prediction stays in sync. */
	private discardInputs(): void {
		for (const entry of this.players.values()) {
			const last = entry.queue.at(-1);
			if (last) {
				entry.state.lastSeq = last.seq;
				entry.queue = [];
			}
		}
	}

	private collectCoin(): void {
		for (const { state } of this.players.values()) {
			if (circlesOverlap(state, PLAYER_RADIUS, this.coin, COIN_RADIUS)) {
				state.score++;
				this.respawnCoin();
				return;
			}
		}
	}

	private collectBigCoin(): void {
		const big = this.bigCoin;
		if (!big) {
			return;
		}
		for (const { state } of this.players.values()) {
			if (circlesOverlap(state, PLAYER_RADIUS, big, BIG_COIN_RADIUS)) {
				state.score += BIG_COIN_VALUE;
				this.bigCoin = null;
				this.nextBigCoinTimer = this.randomTicks(BIG_COIN_DELAY_TICKS);
				return;
			}
		}
	}

	/** Age the big coin on the board, or count down to the next one and spawn it. */
	private updateBigCoin(): void {
		if (this.bigCoin) {
			if (--this.bigCoin.ticksLeft <= 0) {
				this.bigCoin = null;
				this.nextBigCoinTimer = this.randomTicks(BIG_COIN_DELAY_TICKS);
			}
		} else if (--this.nextBigCoinTimer <= 0) {
			const pos = pickSpawn(BIG_COIN_RADIUS, this.obstacles(), this.rng);
			this.setBigCoin(pos);
		}
	}

	/** Circles new pickups must not overlap: players and everything already on the board. */
	private obstacles(): Circle[] {
		const circles: Circle[] = [...this.players.values()].map(({ state }) => ({
			x: state.x,
			y: state.y,
			r: PLAYER_RADIUS,
		}));
		circles.push({ x: this.coin.x, y: this.coin.y, r: COIN_RADIUS });
		if (this.bigCoin) {
			circles.push({ x: this.bigCoin.x, y: this.bigCoin.y, r: BIG_COIN_RADIUS });
		}
		return circles;
	}

	/** Remove round-only pickups (big coin, boosts) and effects. */
	private clearExtras(): void {
		this.bigCoin = null;
	}

	private randomTicks([min, max]: readonly [number, number]): number {
		return min + Math.floor(this.rng() * (max - min + 1));
	}

	private respawnCoin(): void {
		const positions = [...this.players.values()].map((e) => e.state);
		this.coin = { id: this.coin.id + 1, ...pickCoinSpawn(positions, this.rng) };
	}

	private startRound(): void {
		for (const { state } of this.players.values()) {
			state.score = 0;
		}
		this.roundPhase = 'playing';
		this.ticksLeft = ROUND_TICKS;
		this.winners = [];
		this.clearExtras();
		this.nextBigCoinTimer = this.randomTicks(BIG_COIN_DELAY_TICKS);
	}

	private endRound(): void {
		const states = [...this.players.values()].map((e) => e.state);
		const top = Math.max(...states.map((s) => s.score));
		this.winners = states.filter((s) => s.score === top).map((s) => s.id);
		this.roundPhase = 'results';
		this.ticksLeft = RESULTS_TICKS;
		this.clearExtras();
	}

	private findByToken(token: string): PlayerEntry | undefined {
		return [...this.players.values()].find((e) => e.token === token);
	}

	/** Move a player to a new connection id, resetting input sequencing for the new client. */
	private handOver(entry: PlayerEntry, newId: string): void {
		this.players.delete(entry.state.id);
		entry.state.id = newId;
		entry.state.lastSeq = 0;
		entry.highestSeq = 0;
		entry.queue = [];
		entry.credits = MAX_INPUT_CREDITS;
		this.players.set(newId, entry);
	}

	/** Random player position not touching the coin, so nobody scores just by joining. */
	private playerSpawn(): Vec {
		let pos = randomPointInArena(PLAYER_RADIUS, this.rng);
		for (let i = 1; i < COIN_SPAWN_ATTEMPTS; i++) {
			if (!circlesOverlap(pos, PLAYER_RADIUS, this.coin, COIN_RADIUS)) {
				return pos;
			}
			pos = randomPointInArena(PLAYER_RADIUS, this.rng);
		}
		return pos;
	}

	private freeColor(): string {
		const taken = new Set([...this.players.values()].map((e) => e.state.color));
		return PALETTE.find((c) => !taken.has(c)) ?? PALETTE[0]!;
	}
}
