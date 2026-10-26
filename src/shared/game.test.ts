import { describe, expect, test } from 'vitest';
import {
	COIN_RADIUS,
	COIN_SPAWN_ATTEMPTS,
	KNOCK_DECAY,
	PALETTE,
	PLAYER_RADIUS,
	TICK_DT,
	innerBounds,
} from './constants.js';
import {
	NO_INPUT,
	NO_MOVE,
	applyInput,
	calculateRank,
	circlesOverlap,
	inputToMove,
	isPlayerKey,
	isValidJoinRequest,
	knockStep,
	movePlayer,
	normalizeName,
	parseInputMessage,
	pickCoinSpawn,
	pickSpawn,
	pullToward,
	randomPointInArena,
	sortScoreboard,
	speedMultiplier,
} from './game.js';

describe('movePlayer', () => {
	test('moves along the direction by speed * dt', () => {
		expect(movePlayer({ x: 100, y: 100 }, { x: 1, y: 0 }, 0.1)).toEqual({ x: 130, y: 100 });
	});

	test('a shorter direction moves proportionally slower', () => {
		const p = movePlayer({ x: 300, y: 300 }, { x: 0, y: 0.5 }, 0.1);
		expect(p.y).toBeCloseTo(315);
	});

	test('a direction longer than 1 is capped at full speed', () => {
		const p = movePlayer({ x: 300, y: 300 }, { x: 30, y: 40 }, 0.1);
		expect(Math.hypot(p.x - 300, p.y - 300)).toBeCloseTo(30);
	});

	test('a zero direction stands still', () => {
		expect(movePlayer({ x: 300, y: 300 }, NO_MOVE, 1)).toEqual({ x: 300, y: 300 });
	});

	test.each([
		['up', { x: 0, y: -1 }, { x: 300, y: 70 }, { x: 300, y: 66 }],
		['down', { x: 0, y: 1 }, { x: 300, y: 455 }, { x: 300, y: 459 }],
		['left', { x: -1, y: 0 }, { x: 25, y: 200 }, { x: 21, y: 200 }],
		['right', { x: 1, y: 0 }, { x: 615, y: 200 }, { x: 619, y: 200 }],
	])('clamps at the %s wall', (_name, move, start, end) => {
		expect(movePlayer(start, move, 1)).toEqual(end);
	});
});

describe('inputToMove', () => {
	test('one key is a unit direction', () => {
		expect(inputToMove({ ...NO_INPUT, right: true })).toEqual({ x: 1, y: 0 });
		expect(inputToMove({ ...NO_INPUT, up: true })).toEqual({ x: 0, y: -1 });
	});

	test('diagonals are normalised so they are not faster', () => {
		const m = inputToMove({ ...NO_INPUT, right: true, down: true });
		expect(Math.hypot(m.x, m.y)).toBeCloseTo(1);
		expect(m.x).toBeCloseTo(m.y);
	});

	test('opposite keys cancel', () => {
		expect(inputToMove({ up: true, down: true, left: false, right: false })).toEqual(NO_MOVE);
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
		expect(randomPointInArena(COIN_RADIUS, () => 0)).toEqual({ x: 15, y: 60 });
		expect(randomPointInArena(COIN_RADIUS, () => 0.999999).x).toBeLessThanOrEqual(625);
	});

	test('coin avoids players', () => {
		const seq = [0, 0, 0.5, 0.5];
		let i = 0;
		const p = pickCoinSpawn([{ x: 15, y: 60 }], () => seq[i++] ?? 0.5);
		expect(p).toEqual(randomPointInArena(COIN_RADIUS, () => 0.5));
	});

	test('coin spawn falls back when no free spot', () => {
		let calls = 0;
		const p = pickCoinSpawn([{ x: 15, y: 60 }], () => {
			calls++;
			return 0;
		});
		expect(p).toEqual({ x: 15, y: 60 });
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

describe('parseInputMessage', () => {
	test('accepts a direction', () => {
		expect(parseInputMessage({ seq: 1, move: { x: 0.6, y: 0.8 } })).toEqual({
			seq: 1,
			move: { x: 0.6, y: 0.8 },
		});
	});

	test('caps a direction longer than 1 at length 1', () => {
		const msg = parseInputMessage({ seq: 2, move: { x: 30, y: 40 } })!;
		expect(msg.move.x).toBeCloseTo(0.6);
		expect(msg.move.y).toBeCloseTo(0.8);
	});

	test('converts the old key-flag format from pages loaded before an update', () => {
		expect(parseInputMessage({ seq: 3, input: { ...NO_INPUT, left: true } })).toEqual({
			seq: 3,
			move: { x: -1, y: 0 },
		});
	});

	test.each([
		null,
		'x',
		{},
		{ seq: -1, move: NO_MOVE },
		{ seq: 1.5, move: NO_MOVE },
		{ seq: NaN, move: NO_MOVE },
		{ seq: 1e20, move: NO_MOVE },
		{ seq: '1', move: NO_MOVE },
		{ seq: 1, move: null },
		{ seq: 1, move: { x: NaN, y: 0 } },
		{ seq: 1, move: { x: Infinity, y: 0 } },
		{ seq: 1, move: { x: '1', y: 0 } },
		{ seq: 1, move: { x: 1 } },
		{ seq: 1, input: { ...NO_INPUT, up: 'true' } },
		{ seq: 1, input: { up: true } },
	])('rejects %j', (v) => {
		expect(parseInputMessage(v)).toBeNull();
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

describe('boost maths', () => {
	test('movePlayer applies a speed multiplier', () => {
		expect(movePlayer({ x: 100, y: 100 }, { x: 1, y: 0 }, 0.1, 1.5).x).toBeCloseTo(145);
	});

	test.each([
		[[], 1],
		[['speed'], 1.5],
		[['slow'], 0.5],
		[['speed', 'slow'], 0.75],
		[['magnet', 'double'], 1],
	] as const)('speedMultiplier(%j) = %d', (kinds, expected) => {
		expect(speedMultiplier(kinds)).toBeCloseTo(expected);
	});

	test('pickSpawn avoids circles and falls back after the attempt limit', () => {
		const seq = [0, 0, 0.5, 0.5];
		let i = 0;
		const avoid = [{ x: 15, y: 60, r: 15 }];
		expect(pickSpawn(COIN_RADIUS, avoid, () => seq[i++] ?? 0.5)).toEqual(
			randomPointInArena(COIN_RADIUS, () => 0.5),
		);
		let calls = 0;
		const fallback = pickSpawn(COIN_RADIUS, avoid, () => {
			calls++;
			return 0;
		});
		expect(fallback).toEqual({ x: 15, y: 60 });
		expect(calls).toBe(COIN_SPAWN_ATTEMPTS * 2);
	});

	test('pullToward moves up to the step and never past the target', () => {
		expect(pullToward({ x: 100, y: 100 }, { x: 200, y: 100 }, 10, 7)).toEqual({ x: 110, y: 100 });
		expect(pullToward({ x: 100, y: 100 }, { x: 200, y: 100 }, 500, 7)).toEqual({ x: 200, y: 100 });
	});

	test('pullToward stays inside the arena', () => {
		const b = innerBounds(COIN_RADIUS);
		const p = pullToward({ x: 20, y: 100 }, { x: -50, y: 100 }, 100, COIN_RADIUS);
		expect(p.x).toBe(b.minX);
	});
});

describe('isPlayerKey', () => {
	test('accepts a random UUID', () => {
		expect(isPlayerKey('3f2b8c1e-9d4a-4e6b-8a2f-1c3d5e7f9a0b')).toBe(true);
		expect(isPlayerKey(crypto.randomUUID())).toBe(true);
	});

	test.each([
		'',
		'abc',
		'3f2b8c1e-9d4a-4e6b-8a2f-1c3d5e7f9a0b0',
		'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
		42,
		null,
		undefined,
	])('rejects %j', (value) => {
		expect(isPlayerKey(value)).toBe(false);
	});
});

describe('knockStep', () => {
	test('moves by the knock for one tick, then decays it', () => {
		const { pos, knock } = knockStep({ x: 300, y: 300 }, { x: 820, y: 0 });
		expect(pos.x).toBeCloseTo(300 + 820 * TICK_DT);
		expect(knock.x).toBeCloseTo(820 * KNOCK_DECAY);
	});

	test('fades to 5% over 0.3 seconds and stops once tiny', () => {
		let state = { pos: { x: 100, y: 300 }, knock: { x: 820, y: 0 } };
		for (let i = 0; i < 9; i++) state = knockStep(state.pos, state.knock);
		expect(state.knock.x).toBeCloseTo(820 * 0.05);
		for (let i = 0; i < 60; i++) state = knockStep(state.pos, state.knock);
		expect(state.knock).toEqual({ x: 0, y: 0 });
	});

	test('bounces off a wall, losing 40% of that axis', () => {
		const { maxX } = innerBounds(PLAYER_RADIUS);
		const { pos, knock } = knockStep({ x: maxX, y: 300 }, { x: 500, y: 100 });
		expect(pos.x).toBe(maxX);
		expect(knock.x).toBeCloseTo(-300 * KNOCK_DECAY);
		expect(knock.y).toBeCloseTo(100 * KNOCK_DECAY);
	});

	test('no knock means no movement', () => {
		expect(knockStep({ x: 300, y: 300 }, { x: 0, y: 0 })).toEqual({
			pos: { x: 300, y: 300 },
			knock: { x: 0, y: 0 },
			touched: false,
		});
	});
});

describe('dash', () => {
	test('parseInputMessage keeps dash only when it is exactly true', () => {
		const move = { x: 1, y: 0 };
		expect(parseInputMessage({ seq: 1, move, dash: true })).toEqual({ seq: 1, move, dash: true });
		expect(parseInputMessage({ seq: 1, move, dash: 'yes' })).toEqual({ seq: 1, move });
		expect(parseInputMessage({ seq: 1, move, dash: 1 })).toEqual({ seq: 1, move });
	});

	test('a dash covers its input and the next four at 3x speed, ignoring their moves', () => {
		const right = { x: 1, y: 0 };
		const up = { x: 0, y: -1 };
		let state = applyInput({ x: 100, y: 300 }, right, null, true, 1, right);
		expect(state.pos.x).toBeCloseTo(130);
		expect(state.velocity).toEqual({ x: 900, y: 0 });
		for (let i = 0; i < 4; i++) {
			state = applyInput(state.pos, up, state.dash, false, 1, right);
		}
		expect(state.pos).toEqual({ x: 250, y: 300 });
		expect(state.dash).toBeNull();
		state = applyInput(state.pos, up, state.dash, false, 1, right);
		expect(state.pos.y).toBeCloseTo(290);
	});

	test('a dash with no move uses the fallback direction and scales with boosts', () => {
		const state = applyInput({ x: 300, y: 300 }, NO_MOVE, null, true, 1.5, { x: 0, y: 1 });
		expect(state.pos.y).toBeCloseTo(345);
		expect(state.dash).toEqual({ left: 4, dir: { x: 0, y: 1 } });
	});

	test('without a dash it is a normal move', () => {
		const state = applyInput({ x: 300, y: 300 }, { x: 1, y: 0 }, null, false, 1, { x: 1, y: 0 });
		expect(state).toEqual({ pos: { x: 310, y: 300 }, dash: null, velocity: { x: 300, y: 0 } });
	});
});
