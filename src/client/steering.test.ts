import { describe, expect, test } from 'vitest';
import { movePlayer } from '../shared/game.js';
import type { Vec } from '../shared/protocol.js';
import { PointerSteering, moveToward, toGameCoords } from './steering.js';

describe('moveToward', () => {
	test('far targets get a full-length direction', () => {
		const m = moveToward({ x: 100, y: 100 }, { x: 400, y: 500 }, 10);
		expect(Math.hypot(m.x, m.y)).toBeCloseTo(1);
		expect(m.x / m.y).toBeCloseTo(300 / 400);
	});

	test('near targets get a shorter direction so the step lands on them', () => {
		const m = moveToward({ x: 100, y: 100 }, { x: 105, y: 100 }, 10);
		expect(m).toEqual({ x: 0.5, y: 0 });
	});

	test('within half a pixel the player stops', () => {
		expect(moveToward({ x: 100, y: 100 }, { x: 100.3, y: 100 }, 10)).toEqual({ x: 0, y: 0 });
	});

	test.each([
		['normal', 10, 1],
		['speed boost', 15, 1.5],
		['slowed', 5, 0.5],
	])('reaches the target exactly without passing it (%s)', (_name, step, factor) => {
		const target = { x: 333.3, y: 222.2 };
		let pos: Vec = { x: 100, y: 400 };
		let lastDistance = Infinity;
		for (let i = 0; i < 100; i++) {
			pos = movePlayer(pos, moveToward(pos, target, step), 1 / 30, factor);
			const distance = Math.hypot(target.x - pos.x, target.y - pos.y);
			expect(distance).toBeLessThanOrEqual(lastDistance + 1e-9);
			lastDistance = distance;
		}
		expect(lastDistance).toBeLessThan(0.001);
	});
});

test('toGameCoords maps page pixels on a scaled canvas to game units', () => {
	const rect = { left: 10, top: 20, width: 320, height: 240 };
	expect(toGameCoords(10, 20, rect)).toEqual({ x: 0, y: 0 });
	expect(toGameCoords(170, 140, rect)).toEqual({ x: 320, y: 240 });
});

function pointer(type: string, id: number, x: number, y = 0): Event {
	return Object.assign(new Event(type, { cancelable: true }), {
		pointerId: id,
		clientX: x,
		clientY: y,
	});
}

describe('PointerSteering', () => {
	const toGame = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

	test('press sets a target, drag moves it, release clears it', () => {
		const surface = new EventTarget();
		const steering = new PointerSteering(surface, toGame);
		expect(steering.target).toBeNull();
		surface.dispatchEvent(pointer('pointerdown', 1, 50, 60));
		expect(steering.target).toEqual({ x: 50, y: 60 });
		surface.dispatchEvent(pointer('pointermove', 1, 70, 80));
		expect(steering.target).toEqual({ x: 70, y: 80 });
		surface.dispatchEvent(pointer('pointerup', 1, 70, 80));
		expect(steering.target).toBeNull();
	});

	test('moving without pressing does nothing', () => {
		const surface = new EventTarget();
		const steering = new PointerSteering(surface, toGame);
		surface.dispatchEvent(pointer('pointermove', 1, 70, 80));
		expect(steering.target).toBeNull();
	});

	test('cancel and lost capture stop steering', () => {
		const surface = new EventTarget();
		const steering = new PointerSteering(surface, toGame);
		for (const type of ['pointercancel', 'lostpointercapture']) {
			surface.dispatchEvent(pointer('pointerdown', 1, 50));
			surface.dispatchEvent(pointer(type, 1, 50));
			expect(steering.target).toBeNull();
		}
	});

	test('a second finger is ignored while the first one steers', () => {
		const surface = new EventTarget();
		const steering = new PointerSteering(surface, toGame);
		surface.dispatchEvent(pointer('pointerdown', 1, 50));
		surface.dispatchEvent(pointer('pointerdown', 2, 300));
		surface.dispatchEvent(pointer('pointermove', 2, 310));
		expect(steering.target).toEqual({ x: 50, y: 0 });
		surface.dispatchEvent(pointer('pointerup', 2, 310));
		expect(steering.target).toEqual({ x: 50, y: 0 });
	});
});
