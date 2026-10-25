import { expect, test } from 'vitest';
import { ARENA, PLAYER_RADIUS } from '../../shared/constants.js';
import { labelLayout, labelX } from './layout.js';

test('labels sit above a player in open space', () => {
	const { nameY, tagsY } = labelLayout(300);
	expect(nameY).toBeLessThan(300 - PLAYER_RADIUS);
	expect(tagsY).toBeLessThan(nameY);
});

test('labels flip below a player at the top wall so they never cover the header', () => {
	const top = ARENA.y + 1 + PLAYER_RADIUS;
	const { nameY, tagsY } = labelLayout(top);
	expect(nameY).toBeGreaterThan(top + PLAYER_RADIUS);
	expect(tagsY).toBeGreaterThan(nameY);
});

test('labels above never reach into the header', () => {
	for (let y = ARENA.y + 1 + PLAYER_RADIUS; y < 200; y++) {
		const { tagsY } = labelLayout(y);
		expect(tagsY - 8).toBeGreaterThanOrEqual(ARENA.y);
	}
});

test('label centre stays put in open space', () => {
	expect(labelX(320, 80)).toBe(320);
});

test('labels near a side wall shift inward so they are not cut off', () => {
	const left = labelX(ARENA.x + 20, 100);
	expect(left - 50).toBeGreaterThanOrEqual(ARENA.x);
	const right = labelX(ARENA.x + ARENA.width - 20, 100);
	expect(right + 50).toBeLessThanOrEqual(ARENA.x + ARENA.width);
});
