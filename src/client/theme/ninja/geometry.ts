/** Cream paper colour used by tags, the join panel and the results scroll. */
export const PAPER = '#f6ecd2';

const NOODLE_COLORS = ['#f7d775', '#f2c55a', '#fbe39a', '#eab94e', '#f5cf68'];

function fmt(n: number): string {
	return n.toFixed(2);
}

/** Small deterministic PRNG, so generated art looks the same on every load. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Closed circle outline with `ridges` small bumps, like the edge of a fishcake slice. */
export function ridgedCirclePath(radius: number, ridges: number, depth: number): string {
	const steps = ridges * 12;
	const parts: string[] = [];
	for (let i = 0; i <= steps; i++) {
		const a = (i / steps) * Math.PI * 2;
		const r = radius + depth * Math.cos(ridges * a);
		parts.push(`${fmt(r * Math.cos(a))} ${fmt(r * Math.sin(a))}`);
	}
	return `M${parts.join(' L')} Z`;
}

/** Archimedean spiral from `start` to `radius` over `turns` turns. */
export function spiralPath(turns: number, radius: number, start: number, steps = 200): string {
	const parts: string[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const a = t * turns * Math.PI * 2;
		const r = start + (radius - start) * t;
		parts.push(`${fmt(r * Math.cos(a))} ${fmt(r * Math.sin(a))}`);
	}
	return `M${parts.join(' L')}`;
}

/** Catmull-Rom curve through `pts`, as SVG cubic segments. */
function smoothPath(pts: [number, number][]): string {
	let d = `M${fmt(pts[0]![0])} ${fmt(pts[0]![1])}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(i - 1, 0)]!;
		const p1 = pts[i]!;
		const p2 = pts[i + 1]!;
		const p3 = pts[Math.min(i + 2, pts.length - 1)]!;
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C${fmt(c1[0]!)} ${fmt(c1[1]!)} ${fmt(c2[0]!)} ${fmt(c2[1]!)} ${fmt(p2[0])} ${fmt(p2[1])}`;
	}
	return d;
}

/**
 * Smooth wavy noodle strands spread across an ellipse (centre y `cy`, radii `rx`/`ry`) at
 * random heights, phases and shades. Callers clip them to the broth.
 */
export function noodleStrands(
	seed: number,
	count: number,
	rx: number,
	ry: number,
	cy: number,
	width = 1,
	tilt = 0.35,
): { d: string; color: string; width: number }[] {
	const rnd = mulberry32(seed);
	const range = (min: number, max: number) => min + rnd() * (max - min);
	const strands: { d: string; color: string; width: number }[] = [];
	for (let i = 0; i < count; i++) {
		const angle = range(-tilt, tilt);
		const y0 = cy + range(-ry, ry);
		const amp = range(0.5, 1.1);
		const wavelength = range(3.2, 5.2);
		const phase = range(0, Math.PI * 2);
		const length = 2.3 * rx;
		const x0 = -length / 2 + range(-3, 3);
		const pts: [number, number][] = [];
		for (let k = 0; k <= 28; k++) {
			const t = (k / 28) * length;
			const wave = (2 * Math.PI * t) / wavelength + phase;
			pts.push([
				x0 + t * Math.cos(angle) + amp * 0.3 * Math.cos(wave),
				y0 + t * Math.sin(angle) * 0.45 + amp * Math.sin(wave) * 0.6,
			]);
		}
		const color = NOODLE_COLORS[Math.floor(rnd() * NOODLE_COLORS.length)]!;
		strands.push({ d: smoothPath(pts), color, width });
	}
	return strands;
}

function channels(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
	const [r, g, b] = channels(hex).map((c) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}

/** `hex`, darkened just enough to be readable (contrast 3+) as text on the cream paper. */
export function readableOnPaper(hex: string): string {
	let [r, g, b] = channels(hex);
	let color = hex;
	while (contrastRatio(color, PAPER) < 3) {
		[r, g, b] = [r * 0.92, g * 0.92, b * 0.92];
		color = `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
	}
	return color;
}
