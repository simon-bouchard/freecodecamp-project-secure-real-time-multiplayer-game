import { expect, test } from 'vitest';
import { COIN_RADIUS, PALETTE, PLAYER_RADIUS, innerBounds } from './constants.js';

test('innerBounds for a player', () => {
	expect(innerBounds(PLAYER_RADIUS)).toEqual({ minX: 21, maxX: 619, minY: 66, maxY: 459 });
});

test('innerBounds for a coin', () => {
	expect(innerBounds(COIN_RADIUS)).toEqual({ minX: 15, maxX: 625, minY: 60, maxY: 465 });
});

test('PALETTE has 12 unique colours and no gold', () => {
	expect(PALETTE).toHaveLength(12);
	expect(new Set(PALETTE).size).toBe(12);
	expect(PALETTE.map((c) => c.toLowerCase())).not.toContain('#ffd700');
});
