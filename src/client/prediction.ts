import { SNAP_DISTANCE, TICK_DT, TICK_MS } from '../shared/constants.js';
import { knockStep, movePlayer, speedMultiplier } from '../shared/game.js';
import type { InputMessage, ItemKind, Move, PlayerState, Vec } from '../shared/protocol.js';

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
		const factor = this.factorAt(this.pending.length);
		this.pending.push(msg);
		this.previous = this.position;
		const step = knockStep(movePlayer(this.position, msg.move, TICK_DT, factor), this.knock);
		this.position = step.pos;
		this.knock = step.knock;
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
	reconcile(server: PlayerState, snapshotTime = 0): void {
		this.remaining = new Map(
			server.effects.map((e) => [e.kind, Math.round((e.endsAt - snapshotTime) / TICK_MS)]),
		);
		this.pending = this.pending.filter((m) => m.seq > server.lastSeq);
		let pos: Vec = { x: server.x, y: server.y };
		let knock: Vec = { ...server.knock };
		this.pending.forEach((msg, i) => {
			({ pos, knock } = knockStep(movePlayer(pos, msg.move, TICK_DT, this.factorAt(i)), knock));
		});
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
		this.pending = [];
		this.nextSeq = 1;
		this.offset = { x: 0, y: 0 };
	}

	/** Speed factor that will apply to the next local input (boosts and slows included). */
	nextStepFactor(): number {
		return this.factorAt(this.pending.length);
	}

	/** Speed factor for the input that will be the `index`-th unacknowledged one. */
	private factorAt(index: number): number {
		const active = [...this.remaining].filter(([, ticks]) => ticks > index).map(([kind]) => kind);
		return speedMultiplier(active);
	}
}
