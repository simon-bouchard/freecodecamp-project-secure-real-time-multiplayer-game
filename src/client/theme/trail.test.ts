import { expect, test } from 'vitest';
import { SmokeTrail } from './trail.js';

function run(trail: SmokeTrail, boosted: boolean, from = 0, frames = 10) {
	for (let i = 0; i < frames; i++)
		trail.update('a', { x: 100 + i * 5, y: 100 }, boosted, from + i * 16);
}

test('boosted movement leaves puffs', () => {
	const trail = new SmokeTrail();
	run(trail, true);
	expect(trail.puffs('a', 160).length).toBeGreaterThan(0);
});

test('no puffs without the boost or without moving', () => {
	const unboosted = new SmokeTrail();
	run(unboosted, false);
	expect(unboosted.puffs('a', 160)).toEqual([]);

	const still = new SmokeTrail();
	for (let i = 0; i < 10; i++) still.update('a', { x: 100, y: 100 }, true, i * 16);
	expect(still.puffs('a', 160)).toEqual([]);
});

test('puffs fade out and disappear after 450 ms', () => {
	const trail = new SmokeTrail();
	run(trail, true);
	const young = trail.puffs('a', 160);
	const older = trail.puffs('a', 400);
	expect(Math.max(...older.map((p) => p.alpha))).toBeLessThan(
		Math.max(...young.map((p) => p.alpha)),
	);
	expect(trail.puffs('a', 160 + 450 + 16)).toEqual([]);
});

test('forget drops players who left', () => {
	const trail = new SmokeTrail();
	run(trail, true);
	trail.forget(new Set());
	expect(trail.puffs('a', 160)).toEqual([]);
});
