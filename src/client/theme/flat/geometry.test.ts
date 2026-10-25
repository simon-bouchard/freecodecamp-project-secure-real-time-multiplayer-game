import { expect, test } from 'vitest';
import { wavyRingPath } from './geometry.js';

test('wavy ring is closed, stays within radius ± amplitude and has one bump per wave', () => {
	const d = wavyRingPath(19.5, 14, 1.1);
	expect(d.endsWith('Z')).toBe(true);
	const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
	const radii: number[] = [];
	for (let i = 0; i + 1 < nums.length; i += 2) radii.push(Math.hypot(nums[i]!, nums[i + 1]!));
	expect(Math.max(...radii)).toBeCloseTo(20.6, 1);
	expect(Math.min(...radii)).toBeCloseTo(18.4, 1);
	const ring = radii.slice(0, -1);
	let bumps = 0;
	for (let i = 0; i < ring.length; i++) {
		const prev = ring[(i - 1 + ring.length) % ring.length]!;
		const next = ring[(i + 1) % ring.length]!;
		if (ring[i]! > prev && ring[i]! >= next) bumps++;
	}
	expect(bumps).toBe(14);
});
