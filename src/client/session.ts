import type { Socket } from 'socket.io-client';
import { RENDER_DELAY_MS, TICK_MS } from '../shared/constants.js';
import { NO_INPUT, calculateRank } from '../shared/game.js';
import type {
	ClientToServerEvents,
	InputState,
	ServerToClientEvents,
	Snapshot,
} from '../shared/protocol.js';
import { FixedStep } from './fixed-step.js';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import type { FrameView } from './render.js';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function sameInput(a: InputState, b: InputState): boolean {
	return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right;
}

/** Client-side game state: snapshots, prediction and sending input over the socket. */
export class GameSession {
	readonly buffer = new SnapshotBuffer();
	readonly predictor = new Predictor();
	private readonly steps = new FixedStep(TICK_MS);
	private lastSent: InputState = NO_INPUT;
	private lastFrame: number | null = null;

	constructor(
		private readonly socket: GameSocket,
		private readonly readInput: () => InputState,
	) {
		socket.on('connect', () => this.reset());
		socket.on('disconnect', () => this.reset());
		socket.on('snapshot', (snapshot) => this.onSnapshot(snapshot, performance.now()));
	}

	/** Run as many fixed client ticks as the time since the last frame calls for. */
	update(now: number): void {
		const steps = this.steps.advance(now);
		for (let i = 0; i < steps; i++) {
			this.tick();
		}
	}

	/** One client tick: predict and send the current input if a key is held or it changed. */
	tick(): void {
		const input = this.readInput();
		const held = input.up || input.down || input.left || input.right;
		if (!this.socket.connected || (!held && sameInput(input, this.lastSent))) {
			this.predictor.holdStill();
			return;
		}
		const msg = this.predictor.applyLocalInput(input);
		if (msg) {
			this.socket.emit('input', msg);
			this.lastSent = msg.input;
		}
	}

	/** What to draw at local time `now` (same clock as `performance.now()`). */
	view(now: number): FrameView {
		const frameMs = this.lastFrame === null ? 0 : now - this.lastFrame;
		this.lastFrame = now;

		const id = this.socket.id ?? '';
		const latest = this.buffer.latest();
		const players = latest?.players ?? [];
		const others = this.buffer.sample(this.buffer.serverTimeAt(now) - RENDER_DELAY_MS);
		others.delete(id);

		return {
			self: this.predictor.position
				? this.predictor.displayPosition(frameMs, this.steps.alpha)
				: null,
			others,
			coin: latest?.coin ?? null,
			score: players.find((p) => p.id === id)?.score ?? 0,
			rank: calculateRank(players, id),
		};
	}

	private onSnapshot(snapshot: Snapshot, receivedAt: number): void {
		this.buffer.push(snapshot, receivedAt);
		const self = snapshot.players.find((p) => p.id === this.socket.id);
		if (self) {
			this.predictor.reconcile(self);
		}
	}

	private reset(): void {
		this.predictor.reset();
		this.buffer.clear();
		this.lastSent = NO_INPUT;
	}
}
