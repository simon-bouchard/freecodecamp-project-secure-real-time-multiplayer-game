import {
	COIN_RADIUS,
	MAX_INPUT_CREDITS,
	MAX_QUEUED_INPUTS,
	PLAYER_RADIUS,
	TICK_DT,
} from '../shared/constants.js';
import { circlesOverlap, movePlayer, pickCoinSpawn, randomPointInArena } from '../shared/game.js';
import type { CoinState, InputMessage, PlayerState, Snapshot, Vec } from '../shared/protocol.js';

interface PlayerEntry {
	state: PlayerState;
	queue: InputMessage[];
	credits: number;
	highestSeq: number;
}

/** Authoritative game state. Advance it with `step()`, once per server tick. */
export class World {
	private readonly players = new Map<string, PlayerEntry>();
	private coin: CoinState;
	private tick = 0;

	constructor(private readonly rng: () => number = Math.random) {
		this.coin = { id: 1, ...pickCoinSpawn([], rng) };
	}

	/** Add a player at a random position with a fresh score and input sequence. */
	addPlayer(id: string): PlayerState {
		const pos = randomPointInArena(PLAYER_RADIUS, this.rng);
		const state: PlayerState = { id, x: pos.x, y: pos.y, score: 0, lastSeq: 0 };
		this.players.set(id, { state, queue: [], credits: MAX_INPUT_CREDITS, highestSeq: 0 });
		return { ...state };
	}

	removePlayer(id: string): void {
		this.players.delete(id);
	}

	/** Queue a validated input; out-of-order, duplicate and overflowing inputs are dropped. */
	queueInput(id: string, msg: InputMessage): void {
		const entry = this.players.get(id);
		if (!entry || msg.seq <= entry.highestSeq || entry.queue.length >= MAX_QUEUED_INPUTS) {
			return;
		}
		entry.highestSeq = msg.seq;
		entry.queue.push({ seq: msg.seq, input: { ...msg.input } });
	}

	/** Apply queued inputs (rate limited by credits), then resolve at most one coin pickup. */
	step(): void {
		for (const entry of this.players.values()) {
			entry.credits = Math.min(entry.credits + 1, MAX_INPUT_CREDITS);
			while (entry.credits > 0 && entry.queue.length > 0) {
				const msg = entry.queue.shift()!;
				const pos = movePlayer(entry.state, msg.input, TICK_DT);
				entry.state.x = pos.x;
				entry.state.y = pos.y;
				entry.state.lastSeq = msg.seq;
				entry.credits--;
			}
		}

		for (const { state } of this.players.values()) {
			if (circlesOverlap(state, PLAYER_RADIUS, this.coin, COIN_RADIUS)) {
				state.score++;
				const positions = [...this.players.values()].map((e) => e.state);
				this.coin = { id: this.coin.id + 1, ...pickCoinSpawn(positions, this.rng) };
				break;
			}
		}

		this.tick++;
	}

	/** Copy of the current state for broadcasting; `time` is the server clock in ms. */
	snapshot(time: number): Snapshot {
		return {
			tick: this.tick,
			time,
			players: [...this.players.values()].map((e) => ({ ...e.state })),
			coin: { ...this.coin },
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
}
