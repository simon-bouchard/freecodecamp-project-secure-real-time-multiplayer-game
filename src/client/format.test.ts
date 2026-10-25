import { expect, test } from 'vitest';
import {
	blinkVisible,
	formatClock,
	formatRunTime,
	highlightText,
	ordinal,
	winnerText,
} from './format.js';

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

test.each([
	[1, '1st'],
	[2, '2nd'],
	[3, '3rd'],
	[4, '4th'],
	[11, '11th'],
	[12, '12th'],
	[13, '13th'],
	[21, '21st'],
])('ordinal(%d) = %s', (n, text) => {
	expect(ordinal(n)).toBe(text);
});

test.each([
	['today', 'New best today!'],
	['month', 'New best this month!'],
	['all', 'New all-time record!'],
] as const)('highlightText(%s) = %s', (period, text) => {
	expect(highlightText(period)).toBe(text);
});

test('formatRunTime shows the time for today and the date otherwise (UTC in tests)', () => {
	const now = Date.parse('2026-10-25T18:00:00Z');
	expect(formatRunTime(Date.parse('2026-10-25T09:05:00Z'), now)).toBe('09:05');
	expect(formatRunTime(Date.parse('2026-10-24T23:59:00Z'), now)).toBe('Oct 24');
	expect(formatRunTime(Date.parse('2026-01-03T12:00:00Z'), now)).toBe('Jan 3');
});
