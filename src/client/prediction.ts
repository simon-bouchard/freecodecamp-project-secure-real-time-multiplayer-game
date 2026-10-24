import { SNAP_DISTANCE, TICK_DT } from '../shared/constants.js';
import { movePlayer } from '../shared/game.js';
import type { InputMessage, InputState, PlayerState, Vec } from '../shared/protocol.js';

/** Time constant for correction smoothing; about 90% of an error is gone after 100 ms. */
const SMOOTHING_TAU_MS = 100 / Math.LN10;

/** Client-side prediction and server reconciliation for the local player. */
export class Predictor {
	position: Vec | null = null;
	pending: InputMessage[] = [];
	private nextSeq = 1;
	private offset: Vec = { x: 0, y: 0 };

	/** Apply one tick of local input immediately; returns the message to send, or null. */
	applyLocalInput(input: InputState): InputMessage | null {
		if (!this.position) {
			return null;
		}
		const msg: InputMessage = { seq: this.nextSeq++, input: { ...input } };
		this.pending.push(msg);
		this.position = movePlayer(this.position, msg.input, TICK_DT);
		return msg;
	}

	/** Rebase on the server's state and replay inputs it has not applied yet. */
	reconcile(server: PlayerState): void {
		this.pending = this.pending.filter((m) => m.seq > server.lastSeq);
		let pos: Vec = { x: server.x, y: server.y };
		for (const msg of this.pending) {
			pos = movePlayer(pos, msg.input, TICK_DT);
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

	/** Position to draw this frame: prediction plus a decaying visual correction. */
	displayPosition(frameMs: number): Vec {
		const pos = this.position ?? { x: 0, y: 0 };
		const decay = Math.exp(-frameMs / SMOOTHING_TAU_MS);
		this.offset.x *= decay;
		this.offset.y *= decay;
		return { x: pos.x + this.offset.x, y: pos.y + this.offset.y };
	}

	/** Forget everything, e.g. after reconnecting with a new player. */
	reset(): void {
		this.position = null;
		this.pending = [];
		this.nextSeq = 1;
		this.offset = { x: 0, y: 0 };
	}
}
