import type { Socket } from 'socket.io-client';
import { EFFECT_TICKS, RENDER_DELAY_MS, TICK_MS } from '../shared/constants.js';
import { NO_MOVE, calculateRank, sortScoreboard } from '../shared/game.js';
import type {
	ClientToServerEvents,
	Move,
	ItemState,
	JoinFailure,
	JoinRequest,
	JoinResult,
	LeaderboardView,
	ServerToClientEvents,
	Snapshot,
	Vec,
} from '../shared/protocol.js';
import { FixedStep } from './fixed-step.js';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import type { DrawnItem, DrawnPlayer, FrameView } from './render.js';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Profile {
	name: string;
	color: string;
	token: string;
}

function sameMove(a: Move, b: Move): boolean {
	return a.x === b.x && a.y === b.y;
}

/** Client-side game state: snapshots, prediction and sending input over the socket. */
export class GameSession {
	readonly buffer = new SnapshotBuffer();
	readonly predictor = new Predictor();
	private readonly steps = new FixedStep(TICK_MS);
	private lastSent: Move = NO_MOVE;
	private lastFrame: number | null = null;
	private profile: Profile | null = null;
	private isJoined = false;
	private pendingJoin: Promise<JoinResult> | null = null;
	private latestLeaderboard: LeaderboardView | null = null;

	constructor(
		private readonly socket: GameSocket,
		private readonly readInput: () => Move,
		private readonly onRejoinFailed?: (reason: JoinFailure) => void,
		private readonly joinTimeoutMs = 5000,
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
		socket.on('leaderboard', (view) => {
			this.latestLeaderboard = view;
		});
	}

	/** Latest leaderboards sent by the server for this player, if any yet. */
	get leaderboard(): LeaderboardView | null {
		return this.latestLeaderboard;
	}

	get joined(): boolean {
		return this.isJoined;
	}

	/**
	 * Join the game; repeated calls while joining or joined return the same result. On success
	 * the profile is kept so reconnects can take the player back.
	 */
	join(name: string, color: string): Promise<JoinResult> {
		if (this.isJoined && this.profile) {
			return Promise.resolve({ ok: true, token: this.profile.token });
		}
		this.pendingJoin ??= this.sendJoin({ name, color }).finally(() => {
			this.pendingJoin = null;
		});
		return this.pendingJoin;
	}

	private async sendJoin(req: JoinRequest): Promise<JoinResult> {
		let res: JoinResult;
		try {
			res = await this.socket.timeout(this.joinTimeoutMs).emitWithAck('join', req);
		} catch {
			return { ok: false, reason: 'timeout' };
		}
		if (res.ok) {
			this.profile = { name: req.name, color: req.color, token: res.token };
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
		const move = this.readInput();
		const moving = move.x !== 0 || move.y !== 0;
		const playing = this.buffer.latest()?.round.phase === 'playing';
		const idle = !moving && sameMove(move, this.lastSent);
		if (!this.socket.connected || !this.isJoined || !playing || idle) {
			this.predictor.holdStill();
			return;
		}
		const msg = this.predictor.applyLocalInput(move);
		if (msg) {
			this.socket.emit('input', msg);
			this.lastSent = msg.move;
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
		const renderTime = serverNow - RENDER_DELAY_MS;
		const sampled = this.buffer.sample(renderTime);
		const pickups = this.buffer.sampleEntities(renderTime, (s) => [
			{ key: `coin:${s.coin.id}`, x: s.coin.x, y: s.coin.y },
			...(s.bigCoin ? [{ key: `big:${s.bigCoin.id}`, x: s.bigCoin.x, y: s.bigCoin.y }] : []),
			...s.items.map((item) => ({ key: `item:${item.id}`, x: item.x, y: item.y })),
		]);
		const selfPos =
			selfId && this.predictor.position
				? this.predictor.displayPosition(frameMs, this.steps.alpha)
				: null;

		const drawn: DrawnPlayer[] = [];
		for (const p of players) {
			const self = p.id === selfId;
			const pos = self ? selfPos : sampled.get(p.id);
			if (pos) {
				const effects = p.effects.map((e) => ({
					kind: e.kind,
					remainingMs: Math.max(0, e.endsAt - serverNow),
					totalMs: EFFECT_TICKS[e.kind] * TICK_MS,
				}));
				drawn.push({ id: p.id, x: pos.x, y: pos.y, name: p.name, color: p.color, self, effects });
			}
		}

		return {
			players: drawn,
			coin: latest
				? (pickups.get(`coin:${latest.coin.id}`) ?? { x: latest.coin.x, y: latest.coin.y })
				: null,
			bigCoin: latest?.bigCoin
				? this.timedPickup(pickups, `big:${latest.bigCoin.id}`, latest.bigCoin, serverNow)
				: null,
			items: (latest?.items ?? []).map((item) => this.boardItem(pickups, item, serverNow)),
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
			highlights:
				latest?.round.phase === 'results' && this.latestLeaderboard
					? new Map(this.latestLeaderboard.highlights.map((h) => [h.playerId, h.period]))
					: new Map(),
			touchTarget: null,
			textScale: 1,
		};
	}

	/**
	 * Interpolated position of a pickup plus its remaining lifetime. A pickup too new to be in
	 * the interpolated range is shown at its latest position rather than hidden.
	 */
	private timedPickup(
		positions: Map<string, Vec>,
		key: string,
		latest: Vec & { expiresAt: number },
		serverNow: number,
	): { x: number; y: number; remainingMs: number } {
		const pos = positions.get(key) ?? latest;
		return { x: pos.x, y: pos.y, remainingMs: Math.max(0, latest.expiresAt - serverNow) };
	}

	private boardItem(positions: Map<string, Vec>, item: ItemState, serverNow: number): DrawnItem {
		return { ...this.timedPickup(positions, `item:${item.id}`, item, serverNow), kind: item.kind };
	}

	/** After a reconnect, rejoin with the stored profile and token. */
	private async rejoin(): Promise<void> {
		if (!this.profile) {
			return;
		}
		const { name, color, token } = this.profile;
		this.profile = null;
		const res = await this.sendJoin({ name, color, token });
		if (!res.ok) {
			this.onRejoinFailed?.(res.reason);
		}
	}

	private onSnapshot(snapshot: Snapshot, receivedAt: number): void {
		this.buffer.push(snapshot, receivedAt);
		const self = snapshot.players.find((p) => p.id === this.socket.id);
		if (self) {
			this.predictor.reconcile(self, snapshot.time);
		}
	}

	private reset(): void {
		this.predictor.reset();
		this.buffer.clear();
		this.lastSent = NO_MOVE;
	}
}
