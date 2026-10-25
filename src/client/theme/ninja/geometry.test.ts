import { describe, expect, test } from 'vitest';
import {
	contrastRatio,
	mulberry32,
	noodleStrands,
	readableOnPaper,
	ridgedCirclePath,
	spiralPath,
} from './geometry.js';

/** Points of an "M x y L x y ..." path. */
function points(d: string): [number, number][] {
	const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
	const out: [number, number][] = [];
	for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
	return out;
}

describe('ridgedCirclePath', () => {
	test('is closed and has one bump per ridge', () => {
		const d = ridgedCirclePath(9, 16, 0.7);
		expect(d.endsWith('Z')).toBe(true);
		const radii = points(d).map(([x, y]) => Math.hypot(x, y));
		let maxima = 0;
		for (let i = 0; i < radii.length - 1; i++) {
			const prev = radii[(i - 1 + radii.length - 1) % (radii.length - 1)]!;
			if (radii[i]! > prev && radii[i]! >= radii[i + 1]!) maxima++;
		}
		expect(maxima).toBe(16);
		expect(Math.max(...radii)).toBeCloseTo(9.7, 1);
		expect(Math.min(...radii)).toBeCloseTo(8.3, 1);
	});
});

describe('spiralPath', () => {
	test('starts near the centre and ends at the radius', () => {
		const pts = points(spiralPath(2.5, 7.2, 0.6));
		expect(Math.hypot(...pts[0]!)).toBeCloseTo(0.6, 1);
		expect(Math.hypot(...pts.at(-1)!)).toBeCloseTo(7.2, 1);
	});
});

describe('mulberry32', () => {
	test('is deterministic and stays in [0, 1)', () => {
		const a = mulberry32(1);
		const b = mulberry32(1);
		const values = Array.from({ length: 100 }, () => a());
		expect(values).toEqual(Array.from({ length: 100 }, () => b()));
		expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
		expect(mulberry32(2)()).not.toBe(mulberry32(1)());
	});
});

describe('noodleStrands', () => {
	test('is deterministic per seed', () => {
		const first = noodleStrands(3, 40, 21, 8, -1.5);
		expect(first).toHaveLength(40);
		expect(noodleStrands(3, 40, 21, 8, -1.5)).toEqual(first);
		expect(noodleStrands(4, 40, 21, 8, -1.5)).not.toEqual(first);
	});

	test('strands are smooth curves with a colour and width', () => {
		for (const strand of noodleStrands(3, 10, 21, 8, -1.5)) {
			expect(strand.d).toMatch(/^M[^C]+( C[^C]+)+$/);
			expect(strand.color).toMatch(/^#[0-9a-f]{6}$/);
			expect(strand.width).toBeGreaterThan(0);
		}
	});
});

describe('readableOnPaper', () => {
	test('darkens light colours until they contrast with the paper', () => {
		for (const light of ['#80ffd4', '#dfb3ff', '#66ff1a', '#1aecff']) {
			expect(contrastRatio(readableOnPaper(light), '#f6ecd2')).toBeGreaterThanOrEqual(3);
		}
	});

	test('leaves dark enough colours unchanged', () => {
		expect(readableOnPaper('#1782cf')).toBe('#1782cf');
	});

	test('contrastRatio matches known values', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
		expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
	});
});
