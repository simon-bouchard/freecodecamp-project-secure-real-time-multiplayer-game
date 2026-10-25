import { expect, test } from 'vitest';
import { blinkVisible, formatClock, winnerText } from './format.js';

test.each([
	[42_001, '0:43'],
	[60_000, '1:00'],
	[5_000, '0:05'],
	[-5, '0:00'],
])('formatClock(%d) = %s', (ms, text) => {
	expect(formatClock(ms)).toBe(text);
});

test.each([
	[[], 'No winner'],
	[['Ann'], 'Winner: Ann'],
	[['Ann', 'Bob'], 'Tie: Ann, Bob'],
])('winnerText(%j) = %s', (names, text) => {
	expect(winnerText(names)).toBe(text);
});

test.each([
	[5000, true],
	[2100, true],
	[1950, true],
	[1850, false],
	[1700, true],
	[0, false],
])('blinkVisible(%d) = %s', (ms, visible) => {
	expect(blinkVisible(ms)).toBe(visible);
});
