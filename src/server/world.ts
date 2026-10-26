import { randomUUID } from 'node:crypto';
import {
	MAPS,
	MAP_CHOICES,
	MAP_IDS,
	type MapChoice,
	type MapId,
	type Obstacle,
	isMapChoice,
	noVotes,
	obstacleGap,
	pushOutOfObstacles,
} from '../shared/maps.js';
import {
	BIG_COIN_DELAY_TICKS,
	BIG_COIN_LIFETIME_TICKS,
	BIG_COIN_RADIUS,
	BIG_COIN_VALUE,
	BUMP_BASE,
	BUMP_STRENGTH,
	COIN_RADIUS,
	DASH_COOLDOWN_TICKS,
	DASH_INPUTS,
	EFFECT_TICKS,
	INPUT_RATE_TOLERANCE,
	ITEM_DELAY_TICKS,
	ITEM_KINDS,
	ITEM_LIFETIME_TICKS,
	ITEM_RADIUS,
	MAGNET_PULL_SPEED,
	MAGNET_RANGE,
	MAX_INPUT_CREDITS,
	MAX_BOARD_ITEMS,
	MAX_PLAYERS,
	MAX_QUEUED_INPUTS,
	PALETTE,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	RESULTS_TICKS,
	ROUND_TICKS,
	TICK_DT,
	TICK_MS,
	VOTE_EARLY_TICKS,
} from '../shared/constants.js';
import {
	type Circle,
	applyInput,
	circlesOverlap,
	clampToArena,
	knockStep,
	normalizeName,
	pickCoinSpawn,
	pickSpawn,
	pullToward,
	speedMultiplier,
} from '../shared/game.js';
import type {
	CoinState,
	GameEvent,
	InputMessage,
	ItemKind,
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

/** A boost waiting on the board. */
interface BoardItem extends TimedPickup {
	kind: ItemKind;
}

interface PlayerEntry {
	state: PlayerState;
	effects: Map<ItemKind, number>;
	queue: InputMessage[];
	credits: number;
	highestSeq: number;
	/** Velocity (px/s) of the last input applied, kept through ticks without input; sizes bumps. */
	steer: Vec;
	/** Ticks until a dash is allowed again. */
	dashCooldown: number;
	/** Ticks since the current dash started; a dash left unfinished too long is dropped. */
	dashAge: number;
	/** Last non-zero move direction, for a dash requested without one. */
	facing: Vec;
	token: string;
	/** Secret per-browser leaderboard key, or null for players without one. */
	key: string | null;
}

/** A player's final result for a finished round. */
export interface RoundResult {
	id: string;
	key: string | null;
	name: string;
	score: number;
}

export interface WorldOptions {
	/** Called once each time a round ends, before scores reset. */
	onRoundEnd?: (results: RoundResult[]) => void;
	/** Ticks of map voting before the first round; 0 (the default) starts it straight away. */
	firstVoteTicks?: number;
}

/** Authoritative game state. Advance it with `step()`, once per server tick. */
export class World {
	private readonly players = new Map<string, PlayerEntry>();
	private coin: CoinState;
	private tick = 0;
	private roundPhase: RoundPhase = 'waiting';
	private mapId: MapId = 'open';
	private readonly firstVoteTicks: number;
	private ticksLeft = 0;
	private winners: string[] = [];
	private bigCoin: TimedPickup | null = null;
	private nextBigCoinTimer = 0;
	private bigCoinIds = 0;
	private items: BoardItem[] = [];
	private nextItemTimer = 0;
	private itemIds = 0;
	/** Boost kinds still to deal before reshuffling, so all four appear before any repeat. */
	private itemBag: ItemKind[] = [];
	/** Pickups during the last tick, sent with the next snapshot. */
	private events: GameEvent[] = [];
	private readonly roundEndListeners: ((results: RoundResult[]) => void)[] = [];

	constructor(
		private readonly rng: () => number = Math.random,
		private readonly newToken: () => string = randomUUID,
		options: WorldOptions = {},
	) {
		this.firstVoteTicks = options.firstVoteTicks ?? 0;
		if (options.onRoundEnd) {
			this.roundEndListeners.push(options.onRoundEnd);
		}
		this.coin = { id: 1, ...pickCoinSpawn([], rng) };
	}

	/** Also call `listener` whenever a round ends. */
	addRoundEndListener(listener: (results: RoundResult[]) => void): void {
		this.roundEndListeners.push(listener);
	}

	get map(): MapId {
		return this.mapId;
	}

	/** Record a player's map vote; ignored outside a vote, from non-players and for bad choices. */
	vote(id: string, choice: unknown): void {
		const entry = this.players.get(id);
		const voting = this.roundPhase === 'voting' || this.roundPhase === 'results';
		if (entry && voting && isMapChoice(choice)) {
			entry.state.vote = choice;
		}
	}

	private voteCounts(): Record<MapChoice, number> {
		const counts = noVotes();
		for (const { state } of this.players.values()) {
			if (state.vote) {
				counts[state.vote]++;
			}
		}
		return counts;
	}

	/** Most votes wins; ties are broken at random; no votes or Random means a random map. */
	private chooseMap(): MapId {
		const counts = this.voteCounts();
		const top = Math.max(...Object.values(counts));
		const tied = MAP_CHOICES.filter((c) => counts[c] === top);
		const choice = top === 0 ? 'random' : tied[Math.floor(this.rng() * tied.length)]!;
		return choice === 'random' ? MAP_IDS[Math.floor(this.rng() * MAP_IDS.length)]! : choice;
	}

	/** Start using `id`, pushing anyone now inside an obstacle out; votes start over. */
	private switchMap(id: MapId): void {
		this.mapId = id;
		for (const { state } of this.players.values()) {
			const { pos } = pushOutOfObstacles(state, this.mapObstacles);
			state.x = pos.x;
			state.y = pos.y;
			state.vote = null;
		}
	}

	/** Test hook: switch the map straight away. */
	setMap(id: MapId): void {
		this.mapId = id;
	}

	private get mapObstacles(): readonly Obstacle[] {
		return MAPS[this.mapId].obstacles;
	}

	get phase(): RoundPhase {
		return this.roundPhase;
	}

	/** Add a player with no checks; the first player into an empty game starts a round. */
	addPlayer(
		id: string,
		name = id,
		color = this.freeColor(),
		key: string | null = null,
	): PlayerState {
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
			knock: { x: 0, y: 0 },
			dash: null,
			dashReadyAt: 0,
			vote: null,
		};
		const entry: PlayerEntry = {
			state,
			effects: new Map(),
			queue: [],
			credits: MAX_INPUT_CREDITS,
			highestSeq: 0,
			steer: { x: 0, y: 0 },
			dashCooldown: 0,
			dashAge: 0,
			facing: { x: 1, y: 0 },
			token: '',
			key,
		};
		this.players.set(id, entry);
		if (this.roundPhase === 'waiting') {
			if (this.firstVoteTicks > 0) {
				this.roundPhase = 'voting';
				this.ticksLeft = this.firstVoteTicks;
			} else {
				this.startRound();
			}
		}
		return { ...state };
	}

	/** Join as a new player, or take back the player that owns `req.token` after a reconnect. */
	join(id: string, req: JoinRequest, key: string | null = null): JoinResult {
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
		this.addPlayer(id, name, req.color, key);
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
		entry.queue.push({
			seq: msg.seq,
			move: { x: msg.move.x, y: msg.move.y },
			...(msg.dash ? { dash: true as const } : {}),
		});
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
		this.events = [];
		if (this.players.size === 0) {
			this.roundPhase = 'waiting';
			this.clearExtras();
		}

		if (this.roundPhase === 'playing') {
			this.applyInputs();
			this.applyKnockback();
			this.resolveBumps();
			this.tickEffects();
			this.applyMagnets();
			this.updateBigCoin();
			this.updateItem();
			this.collectCoin();
			this.collectBigCoin();
			this.collectItem();
			if (--this.ticksLeft <= 0) {
				this.endRound();
			}
		} else if (this.roundPhase === 'results' || this.roundPhase === 'voting') {
			this.discardInputs();
			const everyoneVoted = [...this.players.values()].every((e) => e.state.vote !== null);
			if (this.roundPhase === 'voting' && everyoneVoted) {
				this.ticksLeft = Math.min(this.ticksLeft, VOTE_EARLY_TICKS);
			}
			if (--this.ticksLeft <= 0) {
				this.switchMap(this.chooseMap());
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
			players: [...this.players.values()].map((e) => ({
				...e.state,
				knock: { ...e.state.knock },
				dash: e.state.dash && { left: e.state.dash.left, dir: { ...e.state.dash.dir } },
				dashReadyAt: e.dashCooldown > 0 ? time + e.dashCooldown * TICK_MS : 0,
				effects: [...e.effects].map(([kind, ticks]) => ({
					kind,
					endsAt: time + ticks * TICK_MS,
				})),
			})),
			coin: { ...this.coin },
			bigCoin: this.bigCoin && {
				id: this.bigCoin.id,
				x: this.bigCoin.x,
				y: this.bigCoin.y,
				expiresAt: time + this.bigCoin.ticksLeft * TICK_MS,
			},
			items: this.items.map((item) => ({
				id: item.id,
				kind: item.kind,
				x: item.x,
				y: item.y,
				expiresAt: time + item.ticksLeft * TICK_MS,
			})),
			round: {
				phase: this.roundPhase,
				endsAt: this.roundPhase === 'waiting' ? null : time + this.ticksLeft * TICK_MS,
				winners: [...this.winners],
				map: this.mapId,
				votes: this.voteCounts(),
			},
			events: this.events.map((e) => ({ ...e })),
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

	/** Place a fresh boost of `kind`; also a test hook. */
	addItem(kind: ItemKind, pos: Vec): void {
		this.items.push({ id: ++this.itemIds, kind, ...pos, ticksLeft: ITEM_LIFETIME_TICKS });
	}

	/** Test hook: take a boost off the board. */
	removeItem(id: number): void {
		this.items = this.items.filter((item) => item.id !== id);
	}

	/** Test hook: give a player an effect for `ticks` ticks. */
	setEffect(id: string, kind: ItemKind, ticks: number): void {
		this.players.get(id)?.effects.set(kind, ticks);
	}

	/** Test hook: a player's active effects and their remaining ticks. */
	effectsOf(id: string): ReadonlyMap<ItemKind, number> {
		return this.players.get(id)?.effects ?? new Map();
	}

	/** Test hook: set a player's knockback velocity. */
	setKnock(id: string, knock: Vec): void {
		const entry = this.players.get(id);
		if (entry) {
			entry.state.knock = { ...knock };
		}
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
			entry.dashCooldown = Math.max(0, entry.dashCooldown - 1);
			if (entry.state.dash && ++entry.dashAge > 2 * DASH_INPUTS) {
				entry.state.dash = null;
			}
			if (!entry.state.dash) {
				capSteer(entry, PLAYER_SPEED * speedMultiplier(entry.effects.keys()));
			}
			while (entry.credits >= 1 && entry.queue.length > 0) {
				const msg = entry.queue.shift()!;
				const factor = speedMultiplier(entry.effects.keys());
				const wasDashing = entry.state.dash !== null;
				const startDash = msg.dash === true && !wasDashing && entry.dashCooldown === 0;
				const step = applyInput(
					entry.state,
					msg.move,
					entry.state.dash,
					startDash,
					factor,
					entry.facing,
					this.mapObstacles,
				);
				if (startDash) {
					entry.dashCooldown = DASH_COOLDOWN_TICKS;
					entry.dashAge = 0;
				}
				const length = Math.hypot(msg.move.x, msg.move.y);
				if (length > 0) {
					entry.facing = { x: msg.move.x / length, y: msg.move.y / length };
				}
				entry.steer = step.velocity;
				entry.state.x = step.pos.x;
				entry.state.y = step.pos.y;
				entry.state.dash = step.dash;
				entry.state.lastSeq = msg.seq;
				entry.credits--;
				if (wasDashing || startDash) {
					break;
				}
			}
		}
	}

	/** One tick of every player's knockback (shared with client prediction). */
	private applyKnockback(): void {
		for (const { state, steer } of this.players.values()) {
			const { pos, knock, touched, kicked } = knockStep(
				state,
				state.knock,
				this.mapObstacles,
				steer,
			);
			if (kicked) {
				this.events.push({ kind: 'bumper', playerId: state.id });
			}
			state.x = pos.x;
			state.y = pos.y;
			state.knock = knock;
			if (touched) {
				state.dash = null;
			}
		}
	}

	/**
	 * Push overlapping players apart. A pair moving into each other also shoves each player away,
	 * harder the faster the other one was steering into them.
	 */
	private resolveBumps(): void {
		const entries = [...this.players.values()];
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const a = entries[i]!;
				const b = entries[j]!;
				const dx = b.state.x - a.state.x;
				const dy = b.state.y - a.state.y;
				const dist = Math.hypot(dx, dy);
				if (dist >= 2 * PLAYER_RADIUS) {
					continue;
				}
				const n = dist === 0 ? { x: 1, y: 0 } : { x: dx / dist, y: dy / dist };
				separate(a.state, b.state, n);
				for (const { state } of [a, b]) {
					const { pos } = pushOutOfObstacles(state, this.mapObstacles);
					state.x = pos.x;
					state.y = pos.y;
				}
				const relX = a.steer.x + a.state.knock.x - b.steer.x - b.state.knock.x;
				const relY = a.steer.y + a.state.knock.y - b.steer.y - b.state.knock.y;
				if (relX * n.x + relY * n.y <= 0) {
					continue;
				}
				const aInto = Math.max(0, a.steer.x * n.x + a.steer.y * n.y);
				const bInto = Math.max(0, -(b.steer.x * n.x + b.steer.y * n.y));
				const toB = BUMP_BASE + (BUMP_STRENGTH * aInto) / PLAYER_SPEED;
				const toA = BUMP_BASE + (BUMP_STRENGTH * bInto) / PLAYER_SPEED;
				b.state.knock = { x: n.x * toB, y: n.y * toB };
				a.state.dash = null;
				b.state.dash = null;
				a.state.knock = { x: -n.x * toA, y: -n.y * toA };
				this.events.push({ kind: 'bump', playerId: a.state.id, otherId: b.state.id });
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

	/** Count every effect down by one tick, removing those that run out. */
	private tickEffects(): void {
		for (const { effects } of this.players.values()) {
			for (const [kind, ticks] of effects) {
				if (ticks <= 1) {
					effects.delete(kind);
				} else {
					effects.set(kind, ticks - 1);
				}
			}
		}
	}

	/** Pull each coin toward the nearest magnet holder within range. */
	private applyMagnets(): void {
		const holders = [...this.players.values()]
			.filter((e) => e.effects.has('magnet'))
			.map((e) => e.state);
		if (holders.length === 0) {
			return;
		}
		const pull = <T extends Vec>(coin: T, radius: number): T => {
			let nearest: PlayerState | null = null;
			let best = MAGNET_RANGE;
			for (const holder of holders) {
				const distance = Math.hypot(holder.x - coin.x, holder.y - coin.y);
				if (distance <= best) {
					best = distance;
					nearest = holder;
				}
			}
			if (!nearest) {
				return coin;
			}
			const next = pullToward(coin, nearest, MAGNET_PULL_SPEED * TICK_DT, radius);
			const blocked = this.mapObstacles.some((o) => obstacleGap(o, next) < radius);
			return blocked ? coin : { ...coin, ...next };
		};
		this.coin = pull(this.coin, COIN_RADIUS);
		if (this.bigCoin) {
			this.bigCoin = pull(this.bigCoin, BIG_COIN_RADIUS);
		}
	}

	private updateItem(): void {
		this.items = this.items.filter((item) => --item.ticksLeft > 0);
		if (--this.nextItemTimer <= 0) {
			this.nextItemTimer = this.randomTicks(ITEM_DELAY_TICKS);
			if (this.items.length < MAX_BOARD_ITEMS) {
				this.addItem(
					this.nextItemKind(),
					pickSpawn(ITEM_RADIUS, this.obstacles(), this.rng, this.mapObstacles),
				);
			}
		}
	}

	/**
	 * Deal the next boost kind from a shuffled bag of all four, skipping kinds already on the
	 * board. The bag is refilled once it holds nothing dealable.
	 */
	private nextItemKind(): ItemKind {
		const onBoard = new Set(this.items.map((item) => item.kind));
		if (this.itemBag.every((kind) => onBoard.has(kind))) {
			this.itemBag = [...ITEM_KINDS];
			for (let i = this.itemBag.length - 1; i > 0; i--) {
				const j = Math.floor(this.rng() * (i + 1));
				[this.itemBag[i], this.itemBag[j]] = [this.itemBag[j]!, this.itemBag[i]!];
			}
		}
		let index = this.itemBag.length - 1;
		while (onBoard.has(this.itemBag[index]!)) {
			index--;
		}
		return this.itemBag.splice(index, 1)[0]!;
	}

	/** Each boost goes to the first player touching it; `slow` goes to everyone else instead. */
	private collectItem(): void {
		this.items = this.items.filter((item) => {
			const entry = [...this.players.values()].find((e) =>
				circlesOverlap(e.state, PLAYER_RADIUS, item, ITEM_RADIUS),
			);
			if (!entry) {
				return true;
			}
			if (item.kind === 'slow') {
				for (const other of this.players.values()) {
					if (other !== entry) {
						other.effects.set('slow', EFFECT_TICKS.slow);
					}
				}
			} else {
				entry.effects.set(item.kind, EFFECT_TICKS[item.kind]);
			}
			this.events.push({ kind: 'item', item: item.kind, playerId: entry.state.id });
			return false;
		});
	}

	private coinValue(entry: PlayerEntry, base: number): number {
		return entry.effects.has('double') ? base * 2 : base;
	}

	private collectCoin(): void {
		for (const entry of this.players.values()) {
			const { state } = entry;
			if (circlesOverlap(state, PLAYER_RADIUS, this.coin, COIN_RADIUS)) {
				state.score += this.coinValue(entry, 1);
				this.events.push({ kind: 'coin', playerId: state.id });
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
		for (const entry of this.players.values()) {
			if (circlesOverlap(entry.state, PLAYER_RADIUS, big, BIG_COIN_RADIUS)) {
				entry.state.score += this.coinValue(entry, BIG_COIN_VALUE);
				this.events.push({ kind: 'bigCoin', playerId: entry.state.id });
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
			const pos = pickSpawn(BIG_COIN_RADIUS, this.obstacles(), this.rng, this.mapObstacles);
			this.setBigCoin(pos);
		}
	}

	/** Circles new pickups must not overlap: players and everything already on the board. */
	private obstacles(): Circle[] {
		const players: Circle[] = [...this.players.values()].map(({ state }) => ({
			x: state.x,
			y: state.y,
			r: PLAYER_RADIUS,
		}));
		return [...players, ...this.pickupCircles()];
	}

	/** Circles of everything collectible on the board. */
	private pickupCircles(): Circle[] {
		const circles: Circle[] = [{ x: this.coin.x, y: this.coin.y, r: COIN_RADIUS }];
		if (this.bigCoin) {
			circles.push({ x: this.bigCoin.x, y: this.bigCoin.y, r: BIG_COIN_RADIUS });
		}
		for (const item of this.items) {
			circles.push({ x: item.x, y: item.y, r: ITEM_RADIUS });
		}
		return circles;
	}

	/** Remove round-only pickups (big coin, boosts) and effects. */
	private clearExtras(): void {
		this.bigCoin = null;
		this.items = [];
		for (const entry of this.players.values()) {
			entry.effects.clear();
			entry.state.knock = { x: 0, y: 0 };
			entry.steer = { x: 0, y: 0 };
			entry.state.dash = null;
			entry.dashCooldown = 0;
		}
	}

	private randomTicks([min, max]: readonly [number, number]): number {
		return min + Math.floor(this.rng() * (max - min + 1));
	}

	private respawnCoin(): void {
		this.coin = {
			id: this.coin.id + 1,
			...pickSpawn(COIN_RADIUS, this.obstacles(), this.rng, this.mapObstacles),
		};
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
		this.nextItemTimer = this.randomTicks(ITEM_DELAY_TICKS);
	}

	private endRound(): void {
		const states = [...this.players.values()].map((e) => e.state);
		const top = Math.max(...states.map((s) => s.score));
		this.winners = states.filter((s) => s.score === top).map((s) => s.id);
		this.roundPhase = 'results';
		this.ticksLeft = RESULTS_TICKS;
		this.clearExtras();
		const results = [...this.players.values()].map(({ state, key }) => ({
			id: state.id,
			key,
			name: state.name,
			score: state.score,
		}));
		for (const listener of this.roundEndListeners) {
			try {
				listener(results);
			} catch (error) {
				// A failing listener (e.g. the score database) must never stop the game.
				console.error('Round-end listener failed:', error);
			}
		}
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
		return pickSpawn(PLAYER_RADIUS, this.pickupCircles(), this.rng, this.mapObstacles);
	}

	private freeColor(): string {
		const taken = new Set([...this.players.values()].map((e) => e.state.color));
		return PALETTE.find((c) => !taken.has(c)) ?? PALETTE[0]!;
	}
}

/**
 * Move two overlapping players apart along `n` (from a to b), half each, without leaving the
 * arena; if one is pinned against a wall, the other takes the rest.
 */
function separate(a: Vec, b: Vec, n: Vec): void {
	const push = (p: Vec, dir: number, amount: number) => {
		const moved = clampToArena(
			{ x: p.x + n.x * dir * amount, y: p.y + n.y * dir * amount },
			PLAYER_RADIUS,
		);
		p.x = moved.x;
		p.y = moved.y;
	};
	const gap = () => 2 * PLAYER_RADIUS - Math.hypot(b.x - a.x, b.y - a.y);
	const overlap = gap();
	push(a, -1, overlap / 2);
	push(b, 1, overlap / 2);
	if (gap() > 0) {
		push(b, 1, gap());
	}
	if (gap() > 0) {
		push(a, -1, gap());
	}
}

/** Limit remembered steering speed, so a finished dash can't keep shoving at dash strength. */
function capSteer(entry: { steer: Vec }, max: number): void {
	const speed = Math.hypot(entry.steer.x, entry.steer.y);
	if (speed > max) {
		entry.steer = { x: (entry.steer.x / speed) * max, y: (entry.steer.y / speed) * max };
	}
}
