import { ARENA, PLAYER_RADIUS, innerBounds } from './constants.js';
import type { Vec } from './protocol.js';

/** A solid obstacle: a pillar, a bumper (kicks players away) or a wall block. */
export type Obstacle =
	| { kind: 'circle' | 'bumper'; x: number; y: number; r: number }
	| { kind: 'rect'; x: number; y: number; w: number; h: number };

export const MAP_IDS = ['open', 'pillars', 'crossroads', 'ring', 'lanes', 'pinball'] as const;
export type MapId = (typeof MAP_IDS)[number];

export interface GameMap {
	name: string;
	obstacles: readonly Obstacle[];
}

const CX = ARENA.x + ARENA.width / 2;
const CY = ARENA.y + ARENA.height / 2;

const circle = (x: number, y: number, r: number): Obstacle => ({ kind: 'circle', x, y, r });
const bumper = (x: number, y: number, r: number): Obstacle => ({ kind: 'bumper', x, y, r });
const rect = (x: number, y: number, w: number, h: number): Obstacle => ({
	kind: 'rect',
	x,
	y,
	w,
	h,
});

/** Beads around a circle, three per diagonal, leaving four gates at the compass points. */
function ring(radius: number, bead: number): Obstacle[] {
	return [0, 1, 2, 3].flatMap((i) => {
		const angle = (i * Math.PI) / 2 + Math.PI / 4;
		return [-0.32, 0, 0.32].map((offset) =>
			circle(CX + Math.cos(angle + offset) * radius, CY + Math.sin(angle + offset) * radius, bead),
		);
	});
}

export const MAPS: Record<MapId, GameMap> = {
	open: { name: 'Open field', obstacles: [] },
	pillars: {
		name: 'Pillars',
		obstacles: [
			circle(CX, CY, 26),
			...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => circle(CX + 170 * sx, CY + 95 * sy, 22))),
			circle(CX - 75, CY, 16),
			circle(CX + 75, CY, 16),
		],
	},
	crossroads: {
		name: 'Crossroads',
		obstacles: [ARENA.x + 80, ARENA.x + ARENA.width - 230].flatMap((x) =>
			[ARENA.y + 70, ARENA.y + ARENA.height - 165].map((y) => rect(x, y, 150, 95)),
		),
	},
	ring: { name: 'Center ring', obstacles: ring(120, 14) },
	lanes: {
		name: 'Lanes',
		obstacles: [
			rect(ARENA.x + 60, CY - 75, 210, 14),
			rect(ARENA.x + 370, CY - 75, 200, 14),
			rect(ARENA.x + 160, CY + 61, 310, 14),
		],
	},
	pinball: {
		name: 'Pinball',
		obstacles: [
			bumper(CX, CY, 24),
			...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => bumper(CX + 150 * sx, CY + 80 * sy, 20))),
		],
	},
};

export const NO_OBSTACLES: readonly Obstacle[] = [];

export function isMapId(value: unknown): value is MapId {
	return typeof value === 'string' && (MAP_IDS as readonly string[]).includes(value);
}

/** Outward normal from the obstacle at `p` and the distance to its surface (negative inside). */
export function obstacleContact(o: Obstacle, p: Vec): { n: Vec; gap: number } {
	if (o.kind !== 'rect') {
		const dx = p.x - o.x;
		const dy = p.y - o.y;
		const d = Math.hypot(dx, dy);
		return { n: d === 0 ? { x: 1, y: 0 } : { x: dx / d, y: dy / d }, gap: d - o.r };
	}
	const qx = Math.max(o.x, Math.min(p.x, o.x + o.w));
	const qy = Math.max(o.y, Math.min(p.y, o.y + o.h));
	const d = Math.hypot(p.x - qx, p.y - qy);
	if (d > 0) {
		return { n: { x: (p.x - qx) / d, y: (p.y - qy) / d }, gap: d };
	}
	const exits: [number, Vec][] = [
		[p.x - o.x, { x: -1, y: 0 }],
		[o.x + o.w - p.x, { x: 1, y: 0 }],
		[p.y - o.y, { x: 0, y: -1 }],
		[o.y + o.h - p.y, { x: 0, y: 1 }],
	];
	const [depth, n] = exits.reduce((best, e) => (e[0] < best[0] ? e : best));
	return { n, gap: -depth };
}

export function obstacleGap(o: Obstacle, p: Vec): number {
	return obstacleContact(o, p).gap;
}

/**
 * Push a player circle out of every obstacle it overlaps (twice, for touching obstacles), then
 * back inside the arena. Returns the normals it was pushed along.
 */
export function pushOutOfObstacles(
	pos: Vec,
	obstacles: readonly Obstacle[],
	radius = PLAYER_RADIUS,
): { pos: Vec; normals: Vec[] } {
	let p = { x: pos.x, y: pos.y };
	const normals: Vec[] = [];
	for (let pass = 0; pass < 2; pass++) {
		for (const o of obstacles) {
			const { n, gap } = obstacleContact(o, p);
			if (gap < radius) {
				p = { x: p.x + n.x * (radius - gap), y: p.y + n.y * (radius - gap) };
				normals.push(n);
			}
		}
	}
	const b = innerBounds(radius);
	p = { x: Math.min(Math.max(p.x, b.minX), b.maxX), y: Math.min(Math.max(p.y, b.minY), b.maxY) };
	return { pos: p, normals };
}
