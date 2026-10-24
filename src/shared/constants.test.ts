import { expect, test } from 'vitest';
import { COIN_RADIUS, PLAYER_RADIUS, innerBounds } from './constants.js';

test('innerBounds for a player', () => {
	expect(innerBounds(PLAYER_RADIUS)).toEqual({ minX: 21, maxX: 619, minY: 66, maxY: 459 });
});

test('innerBounds for a coin', () => {
	expect(innerBounds(COIN_RADIUS)).toEqual({ minX: 13, maxX: 627, minY: 58, maxY: 467 });
});
