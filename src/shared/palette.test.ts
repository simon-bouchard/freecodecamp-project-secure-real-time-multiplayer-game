import { expect, test } from 'vitest';
import { PALETTE } from './constants.js';

/** CIELAB from sRGB hex (D65). */
function lab(hex: string): [number, number, number] {
	const [r, g, b] = [1, 3, 5]
		.map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
		.map((v) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92)) as [
		number,
		number,
		number,
	];
	const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
	const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
	const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
	const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 colour difference; around 10+ is clearly different at a glance. */
function deltaE(c1: string, c2: string): number {
	const [L1, a1, b1] = lab(c1);
	const [L2, a2, b2] = lab(c2);
	const rad = Math.PI / 180;
	const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
	const ap1 = a1 * (1 + G);
	const ap2 = a2 * (1 + G);
	const Cp1 = Math.hypot(ap1, b1);
	const Cp2 = Math.hypot(ap2, b2);
	const hue = (bb: number, aa: number) => (Math.atan2(bb, aa) / rad + 360) % 360;
	const hp1 = hue(b1, ap1);
	const hp2 = hue(b2, ap2);
	let dh = hp2 - hp1;
	if (Cp1 * Cp2 === 0) dh = 0;
	else if (dh > 180) dh -= 360;
	else if (dh < -180) dh += 360;
	const dL = L2 - L1;
	const dC = Cp2 - Cp1;
	const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);
	const Lm = (L1 + L2) / 2;
	const Cpm = (Cp1 + Cp2) / 2;
	let hm = hp1 + hp2;
	if (Cp1 * Cp2 !== 0) {
		hm = Math.abs(hp1 - hp2) > 180 ? (hm + (hm < 360 ? 360 : -360)) / 2 : hm / 2;
	}
	const T =
		1 -
		0.17 * Math.cos((hm - 30) * rad) +
		0.24 * Math.cos(2 * hm * rad) +
		0.32 * Math.cos((3 * hm + 6) * rad) -
		0.2 * Math.cos((4 * hm - 63) * rad);
	const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
	const SC = 1 + 0.045 * Cpm;
	const SH = 1 + 0.015 * Cpm * T;
	const RT =
		-2 *
		Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) *
		Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
	return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

test('deltaE matches a published CIEDE2000 reference pair', () => {
	expect(deltaE('#000000', '#000000')).toBe(0);
	expect(deltaE('#ff0000', '#00ff00')).toBeCloseTo(86.6, 0);
});

test('every pair of player colours is clearly distinguishable', () => {
	for (let i = 0; i < PALETTE.length; i++) {
		for (let j = i + 1; j < PALETTE.length; j++) {
			expect(deltaE(PALETTE[i]!, PALETTE[j]!), `${PALETTE[i]} vs ${PALETTE[j]}`).toBeGreaterThan(
				15,
			);
		}
	}
});

test('player colours stand out from the coin, background, wall and outline', () => {
	for (const color of PALETTE) {
		for (const other of ['#ffd700', '#232323', '#a1a1a1', '#ffffff']) {
			expect(deltaE(color, other), `${color} vs ${other}`).toBeGreaterThan(20);
		}
	}
});

test('player colours are bright enough for the black face to show', () => {
	for (const color of PALETTE) {
		expect(lab(color)[0], color).toBeGreaterThanOrEqual(50);
	}
});
