import { expect, test } from 'vitest';
import { FixedStep } from './fixed-step.js';

test('first call only starts the clock', () => {
	expect(new FixedStep(10).advance(1000)).toBe(0);
});

test('counts whole steps and keeps the remainder as alpha', () => {
	const steps = new FixedStep(10);
	steps.advance(0);
	expect(steps.advance(25)).toBe(2);
	expect(steps.alpha).toBeCloseTo(0.5);
	expect(steps.advance(30)).toBe(1);
	expect(steps.alpha).toBeCloseTo(0);
});

test('averages exactly one step per step length despite uneven frames', () => {
	const steps = new FixedStep(1000 / 30);
	let total = 0;
	let now = 0;
	steps.advance(now);
	for (let i = 0; i < 600; i++) {
		now += i % 3 === 0 ? 7 : 16.7;
		total += steps.advance(now);
	}
	expect(total).toBe(Math.floor(now / (1000 / 30)));
});

test('caps steps after a long pause instead of fast-forwarding', () => {
	const steps = new FixedStep(10, 5);
	steps.advance(0);
	expect(steps.advance(10_000)).toBe(5);
	expect(steps.alpha).toBe(0);
});
