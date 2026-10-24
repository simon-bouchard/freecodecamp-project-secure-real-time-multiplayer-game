import { describe, expect, test } from 'vitest';
import { COIN_RADIUS, COIN_SPAWN_ATTEMPTS, PALETTE, innerBounds } from './constants.js';
import {
	NO_INPUT,
	calculateRank,
	circlesOverlap,
	isValidInputMessage,
	isValidJoinRequest,
	movePlayer,
	normalizeName,
	pickCoinSpawn,
	randomPointInArena,
	sortScoreboard,
} from './game.js';

describe('movePlayer', () => {
	test('moves right by speed * dt', () => {
		expect(movePlayer({ x: 100, y: 100 }, { ...NO_INPUT, right: true }, 0.1)).toEqual({
			x: 130,
			y: 100,
		});
	});

	test('diagonal is not faster', () => {
		const p = movePlayer({ x: 300, y: 300 }, { ...NO_INPUT, right: true, down: true }, 0.1);
		expect(Math.hypot(p.x - 300, p.y - 300)).toBeCloseTo(30);
	});

	test('opposite keys cancel', () => {
		const input = { up: true, down: true, left: false, right: false };
		expect(movePlayer({ x: 300, y: 300 }, input, 1)).toEqual({ x: 300, y: 300 });
	});

	test.each([
		['up', { x: 300, y: 70 }, { x: 300, y: 66 }],
		['down', { x: 300, y: 455 }, { x: 300, y: 459 }],
		['left', { x: 25, y: 200 }, { x: 21, y: 200 }],
		['right', { x: 615, y: 200 }, { x: 619, y: 200 }],
	])('clamps at the %s wall', (dir, start, end) => {
		expect(movePlayer(start, { ...NO_INPUT, [dir]: true }, 1)).toEqual(end);
	});
});

test('circlesOverlap is strict', () => {
	expect(circlesOverlap({ x: 0, y: 0 }, 15, { x: 22, y: 0 }, 7)).toBe(false);
	expect(circlesOverlap({ x: 0, y: 0 }, 15, { x: 21.9, y: 0 }, 7)).toBe(true);
});

describe('coin spawning', () => {
	test('coin spawns are always fully inside the arena', () => {
		const b = innerBounds(COIN_RADIUS);
		for (let i = 0; i < 10_000; i++) {
			const p = pickCoinSpawn([]);
			expect(p.x).toBeGreaterThanOrEqual(b.minX);
			expect(p.x).toBeLessThanOrEqual(b.maxX);
			expect(p.y).toBeGreaterThanOrEqual(b.minY);
			expect(p.y).toBeLessThanOrEqual(b.maxY);
		}
	});

	test('rng extremes stay inside', () => {
		expect(randomPointInArena(COIN_RADIUS, () => 0)).toEqual({ x: 13, y: 58 });
		expect(randomPointInArena(COIN_RADIUS, () => 0.999999).x).toBeLessThanOrEqual(627);
	});

	test('coin avoids players', () => {
		const seq = [0, 0, 0.5, 0.5];
		let i = 0;
		const p = pickCoinSpawn([{ x: 13, y: 58 }], () => seq[i++] ?? 0.5);
		expect(p).toEqual(randomPointInArena(COIN_RADIUS, () => 0.5));
	});

	test('coin spawn falls back when no free spot', () => {
		let calls = 0;
		const p = pickCoinSpawn([{ x: 13, y: 58 }], () => {
			calls++;
			return 0;
		});
		expect(p).toEqual({ x: 13, y: 58 });
		expect(calls).toBe(COIN_SPAWN_ATTEMPTS * 2);
	});
});

test('rank with ties', () => {
	const ps = [
		{ id: 'a', score: 3 },
		{ id: 'b', score: 3 },
		{ id: 'c', score: 5 },
		{ id: 'd', score: 1 },
	];
	expect(calculateRank(ps, 'a')).toEqual({ rank: 2, total: 4 });
	expect(calculateRank(ps, 'b')).toEqual({ rank: 2, total: 4 });
	expect(calculateRank(ps, 'c')).toEqual({ rank: 1, total: 4 });
	expect(calculateRank(ps, 'd')).toEqual({ rank: 4, total: 4 });
});

describe('isValidInputMessage', () => {
	test('valid input accepted', () => {
		expect(isValidInputMessage({ seq: 1, input: NO_INPUT })).toBe(true);
	});

	test.each([
		null,
		'x',
		{},
		{ seq: -1, input: NO_INPUT },
		{ seq: 1.5, input: NO_INPUT },
		{ seq: NaN, input: NO_INPUT },
		{ seq: 1e20, input: NO_INPUT },
		{ seq: '1', input: NO_INPUT },
		{ seq: 1, input: null },
		{ seq: 1, input: { ...NO_INPUT, up: 'true' } },
		{ seq: 1, input: { up: true } },
	])('invalid input rejected: %j', (v) => {
		expect(isValidInputMessage(v)).toBe(false);
	});
});

describe('normalizeName', () => {
	test.each([
		['  Bob  ', 'Bob'],
		['', null],
		['   ', null],
		['a'.repeat(12), 'a'.repeat(12)],
		['a'.repeat(13), null],
		['\u0007bob', null],
		['\u{1F600}'.repeat(12), '\u{1F600}'.repeat(12)],
		['\u{1F600}'.repeat(13), null],
		['\u200B', null],
		['\u200D', null],
		['\u202Eabc', null],
		['a\u2028b', null],
		['\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'],
	])('%j -> %j', (raw, expected) => {
		expect(normalizeName(raw)).toBe(expected);
	});
});

describe('isValidJoinRequest', () => {
	test('accepts any colour string so the server can report unknown colours', () => {
		expect(isValidJoinRequest({ name: 'Bob', color: '#000000' })).toBe(true);
	});

	test('accepts a name and palette colour, with or without token', () => {
		expect(isValidJoinRequest({ name: 'Bob', color: PALETTE[0] })).toBe(true);
		expect(isValidJoinRequest({ name: 'Bob', color: PALETTE[0], token: 'abc' })).toBe(true);
	});

	test.each([
		null,
		{ color: PALETTE[0] },
		{ name: 5, color: PALETTE[0] },
		{ name: 'Bob', color: PALETTE[0], token: 5 },
		{ name: 'x'.repeat(65), color: PALETTE[0] },
		{ name: 'Bob', color: 'x'.repeat(65) },
	])('rejects %j', (value) => {
		expect(isValidJoinRequest(value)).toBe(false);
	});
});

test('sortScoreboard orders by score, then name, without mutating', () => {
	const players = [
		{ id: '1', name: 'b', score: 2 },
		{ id: '2', name: 'a', score: 2 },
		{ id: '3', name: 'c', score: 5 },
	];
	expect(sortScoreboard(players).map((p) => p.id)).toEqual(['3', '2', '1']);
	expect(players.map((p) => p.id)).toEqual(['1', '2', '3']);
});
