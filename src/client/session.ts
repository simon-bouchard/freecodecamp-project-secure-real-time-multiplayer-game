import type { Socket } from 'socket.io-client';
import { RENDER_DELAY_MS, TICK_MS } from '../shared/constants.js';
import { NO_INPUT, calculateRank, sortScoreboard } from '../shared/game.js';
import type {
	ClientToServerEvents,
	InputState,
	JoinFailure,
	JoinResult,
	ServerToClientEvents,
	Snapshot,
} from '../shared/protocol.js';
import { FixedStep } from './fixed-step.js';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import type { DrawnPlayer, FrameView } from './render.js';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Profile {
	name: string;
	color: string;
	token: string;
}

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
	private profile: Profile | null = null;
	private isJoined = false;

	constructor(
		private readonly socket: GameSocket,
		private readonly readInput: () => InputState,
		private readonly onRejoinFailed?: (reason: JoinFailure) => void,
	) {
		socket.on('connect', () => {
			this.reset();
			void this.rejoin();
		});
		socket.on('disconnect', () => {
			this.reset();
			this.isJoined = false;
		});
		socket.on('snapshot', (snapshot) => this.onSnapshot(snapshot, performance.now()));
	}

	get joined(): boolean {
		return this.isJoined;
	}

	/** Join the game; on success the profile is kept so reconnects can take the player back. */
	async join(name: string, color: string): Promise<JoinResult> {
		const res = await this.socket.emitWithAck('join', { name, color });
		if (res.ok) {
			this.profile = { name, color, token: res.token };
			this.isJoined = true;
		}
		return res;
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
		const playing = this.buffer.latest()?.round.phase === 'playing';
		const idle = !held && sameInput(input, this.lastSent);
		if (!this.socket.connected || !this.isJoined || !playing || idle) {
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

		const selfId = this.isJoined ? (this.socket.id ?? null) : null;
		const latest = this.buffer.latest();
		const players = latest?.players ?? [];
		const serverNow = this.buffer.serverTimeAt(now);
		const sampled = this.buffer.sample(serverNow - RENDER_DELAY_MS);
		const selfPos =
			selfId && this.predictor.position
				? this.predictor.displayPosition(frameMs, this.steps.alpha)
				: null;

		const drawn: DrawnPlayer[] = [];
		for (const p of players) {
			const self = p.id === selfId;
			const pos = self ? selfPos : sampled.get(p.id);
			if (pos) {
				drawn.push({ id: p.id, x: pos.x, y: pos.y, name: p.name, color: p.color, self });
			}
		}

		return {
			players: drawn,
			coin: latest?.coin ?? null,
			selfId,
			score: players.find((p) => p.id === selfId)?.score ?? 0,
			rank: calculateRank(players, selfId ?? ''),
			round: latest?.round ?? null,
			serverNow,
			scoreboard: sortScoreboard(players).map((p) => ({
				id: p.id,
				name: p.name,
				color: p.color,
				score: p.score,
				self: p.id === selfId,
			})),
		};
	}

	/** After a reconnect, rejoin with the stored profile and token. */
	private async rejoin(): Promise<void> {
		if (!this.profile) {
			return;
		}
		const { name, color, token } = this.profile;
		const res = await this.socket.emitWithAck('join', { name, color, token });
		if (res.ok) {
			this.profile.token = res.token;
			this.isJoined = true;
		} else {
			this.profile = null;
			this.onRejoinFailed?.(res.reason);
		}
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
