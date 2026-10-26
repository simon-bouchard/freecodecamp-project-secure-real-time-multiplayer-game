import { describe, expect, test } from 'vitest';
import { KNOCK_DECAY, PLAYER_RADIUS, innerBounds } from './constants.js';
import { applyInput, knockStep, movePlayer, pickSpawn } from './game.js';
import { MAPS, MAP_IDS, isMapId, obstacleGap } from './maps.js';

const CX = 320;
const CY = 262.5;
const RIGHT = { x: 1, y: 0 };
const DOWN = { x: 0, y: 1 };
const pillars = MAPS.pillars.obstacles;

describe('maps', () => {
	test('six maps, the first is the empty one', () => {
		expect(MAP_IDS).toEqual(['open', 'pillars', 'crossroads', 'ring', 'lanes', 'pinball']);
		expect(MAPS.open.obstacles).toEqual([]);
		expect(isMapId('ring')).toBe(true);
		expect(isMapId('moon')).toBe(false);
	});

	test('every obstacle is inside the arena', () => {
		const b = innerBounds(0);
		for (const id of MAP_IDS) {
			for (const o of MAPS[id].obstacles) {
				const [minX, maxX, minY, maxY] =
					o.kind === 'rect'
						? [o.x, o.x + o.w, o.y, o.y + o.h]
						: [o.x - o.r, o.x + o.r, o.y - o.r, o.y + o.r];
				expect(minX).toBeGreaterThan(b.minX);
				expect(maxX).toBeLessThan(b.maxX);
				expect(minY).toBeGreaterThan(b.minY);
				expect(maxY).toBeLessThan(b.maxY);
			}
		}
	});
});

describe('obstacle collision', () => {
	test('walking into a pillar stops at its edge', () => {
		const pos = movePlayer({ x: CX, y: CY - 41 - 5 }, DOWN, 1 / 30, 1, pillars);
		expect(pos.y).toBeCloseTo(CY - 26 - PLAYER_RADIUS);
	});

	test('knockback bounces off a pillar, losing 40%', () => {
		const { pos, knock, touched } = knockStep({ x: CX, y: CY - 46 }, { x: 0, y: 600 }, pillars);
		expect(pos.y).toBeCloseTo(CY - 26 - PLAYER_RADIUS);
		expect(knock.y).toBeCloseTo(-360 * KNOCK_DECAY);
		expect(touched).toBe(true);
	});

	test('a hard shove cannot tunnel through a thin lane wall', () => {
		const lanes = MAPS.lanes.obstacles;
		const { pos } = knockStep(
			{ x: 150, y: CY - 75 - PLAYER_RADIUS - 12 },
			{ x: 0, y: 2220 },
			lanes,
		);
		expect(pos.y).toBeLessThanOrEqual(CY - 75 - PLAYER_RADIUS + 1e-6);
	});

	test('a bumper kicks a player who runs into it straight back at 900 px/s', () => {
		const pinball = MAPS.pinball.obstacles;
		const start = { x: CX - 24 - PLAYER_RADIUS, y: CY };
		const { knock } = knockStep(start, { x: 0, y: 0 }, pinball, { x: 300, y: 0 });
		expect(knock.x).toBeCloseTo(-900 * KNOCK_DECAY);
		expect(knock.y).toBeCloseTo(0);
	});

	test('a fast hit on a bumper kicks harder, and a glancing one deflects', () => {
		const pinball = MAPS.pinball.obstacles;
		const start = { x: CX - 24 - PLAYER_RADIUS, y: CY };
		const fast = knockStep(start, { x: 1000, y: 0 }, pinball, { x: 0, y: 0 });
		expect(Math.hypot(fast.knock.x, fast.knock.y)).toBeGreaterThan(1100 * KNOCK_DECAY);
		const glancing = knockStep(start, { x: 0, y: 0 }, pinball, { x: 200, y: 300 });
		expect(glancing.knock.x).toBeLessThan(0);
		expect(glancing.knock.y).toBeGreaterThan(0);
	});

	test('standing next to a bumper does nothing', () => {
		const pinball = MAPS.pinball.obstacles;
		const { knock, kicked } = knockStep(
			{ x: CX - 24 - PLAYER_RADIUS, y: CY },
			{ x: 0, y: 0 },
			pinball,
		);
		expect(knock).toEqual({ x: 0, y: 0 });
		expect(kicked).toBe(false);
	});

	test('a bumper kick is reported', () => {
		const pinball = MAPS.pinball.obstacles;
		const start = { x: CX - 24 - PLAYER_RADIUS, y: CY };
		expect(knockStep(start, { x: 0, y: 0 }, pinball, { x: 300, y: 0 }).kicked).toBe(true);
	});

	test('dashing into an obstacle ends the dash there', () => {
		const step = applyInput({ x: CX, y: CY - 41 - 20 }, DOWN, null, true, 1, DOWN, pillars);
		expect(step.pos.y).toBeCloseTo(CY - 41);
		expect(step.dash).toBeNull();
	});

	test('spawns never overlap an obstacle', () => {
		let seed = 7;
		const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		for (const id of MAP_IDS) {
			for (let i = 0; i < 200; i++) {
				const p = pickSpawn(PLAYER_RADIUS, [], rng, MAPS[id].obstacles);
				for (const o of MAPS[id].obstacles)
					expect(obstacleGap(o, p)).toBeGreaterThanOrEqual(PLAYER_RADIUS);
			}
		}
	});
});
