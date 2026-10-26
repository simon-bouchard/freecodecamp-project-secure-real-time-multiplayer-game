import { DASH_COOLDOWN_TICKS, SNAP_DISTANCE, TICK_MS } from '../shared/constants.js';
import { applyInput, knockStep, speedMultiplier } from '../shared/game.js';
import { NO_OBSTACLES, type Obstacle } from '../shared/maps.js';
import type {
	DashState,
	InputMessage,
	ItemKind,
	Move,
	PlayerState,
	Vec,
} from '../shared/protocol.js';

/** Time constant for correction smoothing; about 90% of an error is gone after 100 ms. */
const SMOOTHING_TAU_MS = 100 / Math.LN10;

/** Client-side prediction and server reconciliation for the local player. */
export class Predictor {
	position: Vec | null = null;
	pending: InputMessage[] = [];
	private previous: Vec | null = null;
	private nextSeq = 1;
	private offset: Vec = { x: 0, y: 0 };
	/** Ticks left on each effect as of the last snapshot. */
	private remaining = new Map<ItemKind, number>();
	/** Knockback still to play out after the latest predicted step. */
	private knock: Vec = { x: 0, y: 0 };
	/** Obstacles of the map being played, from the latest snapshot. */
	private obstacles: readonly Obstacle[] = NO_OBSTACLES;
	/** Dash still running after the latest predicted step. */
	private dash: DashState | null = null;
	/** Our last non-zero move direction: a dash while standing still goes this way. */
	private facing: Vec = { x: 1, y: 0 };
	private dashWanted = false;
	/** Server time a dash is allowed again: from the server, and from our own last dash. */
	private serverReadyAt = 0;
	private localReadyAt = 0;

	get dashing(): boolean {
		return this.dash !== null;
	}

	/** True while a requested dash has not been sent yet. */
	get dashPending(): boolean {
		return this.dashWanted;
	}

	/** Server time when the next dash is allowed, as far as we know. */
	get dashReadyAt(): number {
		return Math.max(this.serverReadyAt, this.localReadyAt);
	}

	/**
	 * Ask to dash with the next input; refused while dashing or cooling down, so we never predict
	 * a dash the server will reject. `serverNow` is the estimated server time in ms.
	 */
	requestDash(serverNow: number): boolean {
		if (!this.position || this.dash || this.dashWanted || serverNow < this.dashReadyAt) {
			return false;
		}
		this.dashWanted = true;
		this.localReadyAt = serverNow + DASH_COOLDOWN_TICKS * TICK_MS;
		return true;
	}

	/** Forget a dash request that was never sent (e.g. the round ended first). */
	cancelDash(): void {
		if (this.dashWanted) {
			this.dashWanted = false;
			this.localReadyAt = 0;
		}
	}

	/** True while a bump's knockback is still moving us. */
	get knocked(): boolean {
		return this.knock.x !== 0 || this.knock.y !== 0;
	}

	/** Apply one tick of local input immediately; returns the message to send, or null. */
	applyLocalInput(move: Move): InputMessage | null {
		if (!this.position) {
			return null;
		}
		const msg: InputMessage = { seq: this.nextSeq++, move: { x: move.x, y: move.y } };
		if (this.dashWanted) {
			msg.dash = true;
			if (move.x === 0 && move.y === 0) {
				msg.move = { ...this.facing };
			}
			this.dashWanted = false;
		}
		this.pending.push(msg);
		this.previous = this.position;
		const moved = this.step(this.position, this.dash, this.knock, msg, this.pending.length - 1);
		this.position = moved.pos;
		this.dash = moved.dash;
		this.knock = moved.knock;
		const length = Math.hypot(msg.move.x, msg.move.y);
		if (length > 0) {
			this.facing = { x: msg.move.x / length, y: msg.move.y / length };
		}
		return msg;
	}

	/** Mark a client tick without movement, so drawing stops between ticks. */
	holdStill(): void {
		this.previous = this.position;
	}

	/**
	 * Rebase on the server's state and replay unapplied inputs, one per server tick: input i gets
	 * effects with more than i ticks left and is followed by one knockback step, as on the server.
	 */
	reconcile(
		server: PlayerState,
		snapshotTime = 0,
		obstacles: readonly Obstacle[] = NO_OBSTACLES,
	): void {
		this.obstacles = obstacles;
		this.remaining = new Map(
			server.effects.map((e) => [e.kind, Math.round((e.endsAt - snapshotTime) / TICK_MS)]),
		);
		this.pending = this.pending.filter((m) => m.seq > server.lastSeq);
		this.serverReadyAt = server.dashReadyAt;
		let pos: Vec = { x: server.x, y: server.y };
		let dash = server.dash;
		let knock: Vec = { ...server.knock };
		this.pending.forEach((msg, i) => {
			({ pos, dash, knock } = this.step(pos, dash, knock, msg, i));
		});
		this.dash = dash;
		this.knock = knock;

		if (this.position && this.previous) {
			this.previous = {
				x: this.previous.x + pos.x - this.position.x,
				y: this.previous.y + pos.y - this.position.y,
			};
		} else {
			this.previous = pos;
		}

		if (this.position) {
			this.offset.x += this.position.x - pos.x;
			this.offset.y += this.position.y - pos.y;
			if (Math.hypot(this.offset.x, this.offset.y) > SNAP_DISTANCE) {
				this.offset = { x: 0, y: 0 };
			}
		}
		this.position = pos;
	}

	/**
	 * Position to draw this frame: blended `alpha` of the way from the previous to the current
	 * predicted tick, plus a decaying visual correction.
	 */
	displayPosition(frameMs: number, alpha = 1): Vec {
		const pos = this.position ?? { x: 0, y: 0 };
		const prev = this.previous ?? pos;
		const decay = Math.exp(-frameMs / SMOOTHING_TAU_MS);
		this.offset.x *= decay;
		this.offset.y *= decay;
		return {
			x: prev.x + (pos.x - prev.x) * alpha + this.offset.x,
			y: prev.y + (pos.y - prev.y) * alpha + this.offset.y,
		};
	}

	/** Forget everything, e.g. after reconnecting with a new player. */
	reset(): void {
		this.position = null;
		this.previous = null;
		this.remaining = new Map();
		this.knock = { x: 0, y: 0 };
		this.dash = null;
		this.dashWanted = false;
		this.serverReadyAt = 0;
		this.localReadyAt = 0;
		this.facing = { x: 1, y: 0 };
		this.pending = [];
		this.nextSeq = 1;
		this.offset = { x: 0, y: 0 };
	}

	/** Speed factor that will apply to the next local input (boosts and slows included). */
	nextStepFactor(): number {
		return this.factorAt(this.pending.length);
	}

	/** One input as the server applies it: the move or dash, then one knockback step. */
	private step(
		pos: Vec,
		dash: DashState | null,
		knock: Vec,
		msg: InputMessage,
		index: number,
	): { pos: Vec; dash: DashState | null; knock: Vec } {
		const factor = this.factorAt(index);
		const start = msg.dash === true && dash === null;
		const moved = applyInput(pos, msg.move, dash, start, factor, this.facing, this.obstacles);
		const knocked = knockStep(moved.pos, knock, this.obstacles, moved.velocity);
		return { pos: knocked.pos, dash: knocked.touched ? null : moved.dash, knock: knocked.knock };
	}

	/** Speed factor for the input that will be the `index`-th unacknowledged one. */
	private factorAt(index: number): number {
		const active = [...this.remaining].filter(([, ticks]) => ticks > index).map(([kind]) => kind);
		return speedMultiplier(active);
	}
}
