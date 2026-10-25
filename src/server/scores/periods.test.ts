import { expect, test } from 'vitest';
import { periodStart } from './periods.js';

const at = (iso: string) => Date.parse(iso);

test('today starts at local midnight (tests run in UTC)', () => {
	expect(periodStart('today', at('2026-10-25T23:59:59Z'))).toBe(at('2026-10-25T00:00:00Z'));
	expect(periodStart('today', at('2026-10-26T00:00:00Z'))).toBe(at('2026-10-26T00:00:00Z'));
});

test('month starts at local midnight on the 1st', () => {
	expect(periodStart('month', at('2026-10-25T12:00:00Z'))).toBe(at('2026-10-01T00:00:00Z'));
	expect(periodStart('month', at('2026-11-01T00:00:00Z'))).toBe(at('2026-11-01T00:00:00Z'));
});

test('all time starts at the epoch', () => {
	expect(periodStart('all', at('2026-10-25T12:00:00Z'))).toBe(0);
});
