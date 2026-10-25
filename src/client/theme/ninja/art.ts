import type { ItemKind } from '../../../shared/protocol.js';
import { PAPER, noodleStrands, ridgedCirclePath, spiralPath } from './geometry.js';

/** Sprites are rendered once at this scale so they stay sharp up to a 3x screen. */
const SPRITE_SCALE = 3;

/** A pre-rendered image plus the point inside it that sits on the game position. */
export interface Sprite {
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
	originX: number;
	originY: number;
}

function makeSprite(
	width: number,
	height: number,
	originX: number,
	originY: number,
	draw: (ctx: CanvasRenderingContext2D) => void,
): Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = Math.ceil(width * SPRITE_SCALE);
	canvas.height = Math.ceil(height * SPRITE_SCALE);
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(
		SPRITE_SCALE,
		0,
		0,
		SPRITE_SCALE,
		originX * SPRITE_SCALE,
		originY * SPRITE_SCALE,
	);
	draw(ctx);
	return { canvas, width, height, originX, originY };
}

/** Draw `sprite` with its origin at (x, y), optionally scaled. */
export function drawSprite(
	ctx: CanvasRenderingContext2D,
	sprite: Sprite,
	x: number,
	y: number,
	scale = 1,
): void {
	ctx.drawImage(
		sprite.canvas,
		x - sprite.originX * scale,
		y - sprite.originY * scale,
		sprite.width * scale,
		sprite.height * scale,
	);
}

function lazy<T>(create: () => T): () => T {
	let value: T | undefined;
	return () => (value ??= create());
}

const MAKI_EDGE = new Path2D(ridgedCirclePath(9, 16, 0.7));
const MAKI_SPIRAL = new Path2D(spiralPath(2.5, 7.2, 0.6));

/** Narutomaki slice centred on the origin, about 9 px in radius. */
function paintNarutomaki(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = '#fffaf2';
	ctx.fill(MAKI_EDGE);
	ctx.strokeStyle = '#b9ab95';
	ctx.lineWidth = 0.8;
	ctx.stroke(MAKI_EDGE);
	ctx.strokeStyle = '#ff4f8b';
	ctx.lineWidth = 1.5;
	ctx.lineCap = 'round';
	ctx.stroke(MAKI_SPIRAL);
}

export const narutomakiSprite = lazy(() => makeSprite(22, 22, 11, 11, paintNarutomaki));

const BOWL_BODY = new Path2D('M-26 -2 Q-26 22 0 24 Q26 22 26 -2 Z');
const BOWL_STRIPE = new Path2D('M-24 6 Q0 12 24 6');
const STEAM = [
	{ path: new Path2D('M-8 -15 c-3.5 -3.5 3.5 -6 0 -9 c-3 -3 3 -5 0 -8'), alpha: 0.68 },
	{ path: new Path2D('M1 -16 c-3.5 -3.5 3.5 -6 0 -9 c-3 -3 3 -5 0 -9'), alpha: 0.75 },
	{ path: new Path2D('M10 -15 c-3.5 -3.5 3.5 -6 0 -9 c-3 -3 3 -5 0 -8'), alpha: 0.6 },
];

function strokeStrands(
	ctx: CanvasRenderingContext2D,
	strands: ReturnType<typeof noodleStrands>,
): void {
	ctx.lineCap = 'round';
	for (const strand of strands) {
		const path = new Path2D(strand.d);
		ctx.globalAlpha = 0.5;
		ctx.strokeStyle = '#a8741f';
		ctx.lineWidth = strand.width + 0.8;
		ctx.stroke(path);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = strand.color;
		ctx.lineWidth = strand.width;
		ctx.stroke(path);
	}
}

function ellipse(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	rx: number,
	ry: number,
): void {
	ctx.beginPath();
	ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/** Three-quarter view ramen bowl with heaped noodles, toppings and steam; rim centre at origin. */
function paintRamen(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = '#b5321f';
	ctx.strokeStyle = '#3a120a';
	ctx.lineWidth = 2;
	ctx.fill(BOWL_BODY);
	ctx.stroke(BOWL_BODY);
	ctx.setLineDash([3, 3]);
	ctx.strokeStyle = '#f3d27a';
	ctx.lineWidth = 1.5;
	ctx.stroke(BOWL_STRIPE);
	ctx.setLineDash([]);

	ellipse(ctx, 0, -2, 26, 11);
	ctx.fillStyle = '#b5321f';
	ctx.fill();
	ctx.strokeStyle = '#3a120a';
	ctx.lineWidth = 2;
	ctx.stroke();
	ellipse(ctx, 0, -2, 22.5, 8.8);
	ctx.fillStyle = '#c98a3e';
	ctx.fill();

	ctx.save();
	ellipse(ctx, 0, -1.5, 21.5, 8.2);
	ctx.clip();
	strokeStrands(ctx, noodleStrands(3, 40, 21, 8, -1.5));
	ctx.restore();
	ctx.save();
	ellipse(ctx, 0, -3.8, 12, 4.8);
	ctx.clip();
	ctx.translate(0, -0.8);
	strokeStrands(ctx, noodleStrands(8, 18, 12, 4.8, -3, 1.1, 0.25));
	ctx.restore();

	ellipse(ctx, -13, -4, 4.8, 3);
	ctx.fillStyle = '#fffaf0';
	ctx.fill();
	ctx.strokeStyle = '#c9b48a';
	ctx.lineWidth = 0.6;
	ctx.stroke();
	ellipse(ctx, -12.7, -4, 2.3, 1.6);
	ctx.fillStyle = '#f0a020';
	ctx.fill();

	ctx.save();
	ctx.translate(11, -6);
	ctx.rotate((-8 * Math.PI) / 180);
	ellipse(ctx, 0, 0, 6.5, 3.4);
	ctx.fillStyle = '#b8693a';
	ctx.fill();
	ctx.strokeStyle = '#6e3412';
	ctx.lineWidth = 0.8;
	ctx.stroke();
	ellipse(ctx, 0, 0, 4, 1.8);
	ctx.fillStyle = '#dc9a68';
	ctx.fill();
	ctx.restore();

	ctx.save();
	ctx.translate(14, 0);
	ctx.scale(0.5, 0.3);
	paintNarutomaki(ctx);
	ctx.restore();

	ctx.save();
	ctx.translate(-20, -11);
	ctx.rotate((-14 * Math.PI) / 180);
	ctx.fillStyle = '#1f3329';
	ctx.fillRect(-3, -7, 6.5, 13);
	ctx.restore();

	ctx.strokeStyle = '#4caf3c';
	ctx.lineWidth = 0.7;
	for (const [x, y] of [
		[-3, -6],
		[1, -7],
		[5, -2],
		[-7, 1],
		[3, 2],
	] as const) {
		ellipse(ctx, x, y, 1.1, 0.7);
		ctx.stroke();
	}

	ctx.strokeStyle = '#fffdf6';
	ctx.lineWidth = 2.2;
	ctx.lineCap = 'round';
	for (const { path, alpha } of STEAM) {
		ctx.globalAlpha = alpha;
		ctx.stroke(path);
	}
	ctx.globalAlpha = 1;
}

/** Ramen sprite; its origin is the centre of the bowl rim. */
export const ramenSprite = lazy(() => makeSprite(58, 64, 29, 38, paintRamen));

/** Band colour of each boost tag; also used for effect timers. */
export const TAG_COLORS: Record<ItemKind, string> = {
	speed: '#2bb4e0',
	magnet: '#c03ad6',
	double: '#e8a317',
	slow: '#4d6bd6',
};

const TAG_SHAPE = new Path2D('M-10 -14 h20 v26 l-10 4 l-10 -4 Z');
const GLYPHS: Record<Exclude<ItemKind, 'double'>, { path: Path2D; width: number }[]> = {
	speed: [{ path: new Path2D('M-5 -2 q4 -4 8 0 q-4 0 -2 3 M-5 4 q5 -3 9 1'), width: 1.8 }],
	magnet: [{ path: new Path2D('M-5 -3 v4 a5 5 0 0 0 10 0 v-4'), width: 2.4 }],
	slow: [{ path: new Path2D('M-5 2 q2.5 -4 5 0 q2.5 4 5 0'), width: 1.8 }],
};

/** Paper boost tag for `kind`, centred on the origin, 20 px wide. */
function paintTag(ctx: CanvasRenderingContext2D, kind: ItemKind): void {
	const color = TAG_COLORS[kind];
	ctx.fillStyle = PAPER;
	ctx.fill(TAG_SHAPE);
	ctx.strokeStyle = '#5a3a1a';
	ctx.lineWidth = 1.3;
	ctx.stroke(TAG_SHAPE);
	ctx.fillStyle = color;
	ctx.fillRect(-10, -14, 20, 5);

	ctx.save();
	ctx.translate(0, 2);
	ctx.lineCap = 'round';
	if (kind === 'double') {
		ctx.fillStyle = '#b5321f';
		ctx.font = 'bold 9px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('x2', 0, 5);
	} else {
		ctx.strokeStyle = color;
		for (const glyph of GLYPHS[kind]) {
			ctx.lineWidth = glyph.width;
			ctx.stroke(glyph.path);
		}
		if (kind === 'magnet') {
			ctx.strokeStyle = '#5a3a1a';
			ctx.lineWidth = 2;
			ctx.lineCap = 'butt';
			ctx.stroke(new Path2D('M-6.2 -3 h2.4 M3.8 -3 h2.4'));
		}
		if (kind === 'slow') {
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(0, -3, 1.4, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.restore();
}

const tagSprites = new Map<ItemKind, Sprite>();

/** Cached paper tag sprite for a boost kind (origin at the tag centre). */
export function tagSprite(kind: ItemKind): Sprite {
	let sprite = tagSprites.get(kind);
	if (!sprite) {
		sprite = makeSprite(24, 32, 12, 16, (ctx) => paintTag(ctx, kind));
		tagSprites.set(kind, sprite);
	}
	return sprite;
}
