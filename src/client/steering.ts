import { CANVAS } from '../shared/constants.js';
import type { Move, Vec } from '../shared/protocol.js';

/** Closer than this, the player is considered to be on the target. */
const ARRIVED = 0.5;

/**
 * Direction from `from` toward `target`. Its length is capped so one step of `step` pixels lands
 * exactly on the target instead of passing it.
 */
export function moveToward(from: Vec, target: Vec, step: number): Move {
	const dx = target.x - from.x;
	const dy = target.y - from.y;
	const distance = Math.hypot(dx, dy);
	if (distance < ARRIVED) {
		return { x: 0, y: 0 };
	}
	const length = Math.min(1, distance / step);
	return { x: (dx / distance) * length, y: (dy / distance) * length };
}

/** Page coordinates to game units, for a canvas shown at any size. */
export function toGameCoords(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number; width: number; height: number },
): Vec {
	return {
		x: ((clientX - rect.left) / rect.width) * CANVAS.width,
		y: ((clientY - rect.top) / rect.height) * CANVAS.height,
	};
}

/** Tracks where the first pressed finger (or pen, or mouse button) points, in game units. */
export class PointerSteering {
	private pointerId: number | null = null;
	private current: Vec | null = null;

	constructor(
		private readonly surface: EventTarget,
		private readonly toGame: (event: PointerEvent) => Vec,
	) {
		surface.addEventListener('pointerdown', (e) => this.onDown(e as PointerEvent));
		surface.addEventListener('pointermove', (e) => this.onMove(e as PointerEvent));
		for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
			surface.addEventListener(type, (e) => this.onEnd(e as PointerEvent));
		}
	}

	get target(): Vec | null {
		return this.current;
	}

	private onDown(event: PointerEvent): void {
		if (this.pointerId !== null) {
			return;
		}
		event.preventDefault();
		this.pointerId = event.pointerId;
		this.current = this.toGame(event);
		try {
			(this.surface as Partial<Element>).setPointerCapture?.(event.pointerId);
		} catch {
			// Capture is a nicety (keeps steering when the finger leaves the canvas); go on without it.
		}
	}

	private onMove(event: PointerEvent): void {
		if (event.pointerId === this.pointerId) {
			this.current = this.toGame(event);
		}
	}

	private onEnd(event: PointerEvent): void {
		if (event.pointerId === this.pointerId) {
			this.pointerId = null;
			this.current = null;
		}
	}
}
