import {
	BUMPER_KICK,
	BUMPER_SPEEDUP,
	COIN_RADIUS,
	COIN_SPAWN_ATTEMPTS,
	DASH_INPUTS,
	DASH_SPEED,
	KNOCK_DECAY,
	KNOCK_STOP,
	NAME_MAX_LENGTH,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	SLOW_FACTOR,
	SPEED_BOOST,
	TICK_DT,
	WALL_BOUNCE,
	innerBounds,
} from './constants.js';
import type {
	DashState,
	InputMessage,
	InputState,
	ItemKind,
	JoinRequest,
	Move,
	Vec,
} from './protocol.js';
import {
	NO_OBSTACLES,
	type Obstacle,
	isMapChoice,
	obstacleContact,
	obstacleGap,
	pushOutOfObstacles,
} from './maps.js';

/** Longest single move (px) before checking obstacles again, so fast shoves cannot tunnel. */
const SUBSTEP = 8;

/** A circle to keep spawns away from. */
export interface Circle {
	x: number;
	y: number;
	r: number;
}

export const NO_INPUT: InputState = { up: false, down: false, left: false, right: false };
export const NO_MOVE: Move = { x: 0, y: 0 };

/** Clamp a circle's centre so the whole circle stays inside the arena wall. */
export function clampToArena(pos: Vec, radius: number): Vec {
	const b = innerBounds(radius);
	return {
		x: Math.min(Math.max(pos.x, b.minX), b.maxX),
		y: Math.min(Math.max(pos.y, b.minY), b.maxY),
	};
}

/**
 * Advance a player by `dt` seconds along `move`. Speed scales with the move's length, capped at
 * 1, so no direction is faster than `PLAYER_SPEED * speedMultiplier`.
 */
export function movePlayer(
	pos: Vec,
	move: Move,
	dt: number,
	speedMultiplier = 1,
	obstacles: readonly Obstacle[] = NO_OBSTACLES,
): Vec {
	if (move.x === 0 && move.y === 0) {
		return { x: pos.x, y: pos.y };
	}
	const v = moveVelocity(move, speedMultiplier);
	return moveThrough(pos, { x: v.x * dt, y: v.y * dt }, obstacles).pos;
}

/** Move a player by `delta` in small steps, staying in the arena and out of obstacles. */
function moveThrough(
	pos: Vec,
	delta: Vec,
	obstacles: readonly Obstacle[],
): { pos: Vec; normals: Vec[] } {
	const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / SUBSTEP));
	let p = { x: pos.x, y: pos.y };
	const normals: Vec[] = [];
	for (let i = 0; i < steps; i++) {
		p = clampToArena({ x: p.x + delta.x / steps, y: p.y + delta.y / steps }, PLAYER_RADIUS);
		if (obstacles.length > 0) {
			const out = pushOutOfObstacles(p, obstacles);
			p = out.pos;
			normals.push(...out.normals);
		}
	}
	return { pos: p, normals };
}

/** Velocity in px/s a move asks for; never faster than `PLAYER_SPEED * speedMultiplier`. */
export function moveVelocity(move: Move, speedMultiplier = 1): Vec {
	const length = Math.hypot(move.x, move.y);
	if (length === 0) {
		return { x: 0, y: 0 };
	}
	const scale = (PLAYER_SPEED * speedMultiplier * Math.min(1, length)) / length;
	return { x: move.x * scale, y: move.y * scale };
}

/**
 * Apply one input. A dash (started by this input, or still running) replaces the move: it goes
 * in a fixed direction at `DASH_SPEED` times speed for `DASH_INPUTS` inputs. Shared by server and
 * client. `velocity` is what the input asked for in px/s, used to size bumps.
 */
export function applyInput(
	pos: Vec,
	move: Move,
	dash: DashState | null,
	startDash: boolean,
	speedMultiplier: number,
	fallbackDir: Vec,
	obstacles: readonly Obstacle[] = NO_OBSTACLES,
): { pos: Vec; dash: DashState | null; velocity: Vec } {
	let active = dash;
	if (!active && startDash) {
		const length = Math.hypot(move.x, move.y);
		const dir = length > 0 ? { x: move.x / length, y: move.y / length } : { ...fallbackDir };
		active = { left: DASH_INPUTS, dir };
	}
	if (!active) {
		return {
			pos: movePlayer(pos, move, TICK_DT, speedMultiplier, obstacles),
			dash: null,
			velocity: moveVelocity(move, speedMultiplier),
		};
	}
	const speed = PLAYER_SPEED * DASH_SPEED * speedMultiplier;
	const velocity = { x: active.dir.x * speed, y: active.dir.y * speed };
	const moved = moveThrough(pos, { x: velocity.x * TICK_DT, y: velocity.y * TICK_DT }, obstacles);
	const left = moved.normals.length > 0 ? 0 : active.left - 1;
	return { pos: moved.pos, dash: left > 0 ? { left, dir: active.dir } : null, velocity };
}

/**
 * One tick of knockback: move by it (in small steps), bounce off walls and obstacles (reversing
 * and damping the part going into them), get kicked by bumpers, then fade. Shared by server and
 * client so prediction replays it exactly. `steer` is this tick's own movement velocity, and
 * `touched` says whether the player ended up against an obstacle (which ends a dash).
 */
export function knockStep(
	pos: Vec,
	knock: Vec,
	obstacles: readonly Obstacle[] = NO_OBSTACLES,
	steer: Vec = { x: 0, y: 0 },
): { pos: Vec; knock: Vec; touched: boolean; kicked: boolean } {
	let p = { x: pos.x, y: pos.y };
	const k = { x: knock.x, y: knock.y };
	let touched = false;
	let kicked = false;
	if (knock.x !== 0 || knock.y !== 0) {
		const steps = Math.max(1, Math.ceil((Math.hypot(knock.x, knock.y) * TICK_DT) / SUBSTEP));
		for (let i = 0; i < steps; i++) {
			const moved = { x: p.x + (knock.x * TICK_DT) / steps, y: p.y + (knock.y * TICK_DT) / steps };
			const clamped = clampToArena(moved, PLAYER_RADIUS);
			if (clamped.x !== moved.x && k.x * knock.x > 0) {
				k.x = -k.x * WALL_BOUNCE;
			}
			if (clamped.y !== moved.y && k.y * knock.y > 0) {
				k.y = -k.y * WALL_BOUNCE;
			}
			const out = pushOutOfObstacles(clamped, obstacles);
			p = out.pos;
			touched ||= out.normals.length > 0;
			for (const n of out.normals) {
				const into = k.x * n.x + k.y * n.y;
				if (into < 0) {
					k.x -= (1 + WALL_BOUNCE) * into * n.x;
					k.y -= (1 + WALL_BOUNCE) * into * n.y;
				}
			}
		}
	}
	for (const o of obstacles) {
		const { n, gap } = obstacleContact(o, p);
		const vx = steer.x + knock.x;
		const vy = steer.y + knock.y;
		const vn = vx * n.x + vy * n.y;
		if (gap > PLAYER_RADIUS + 0.5 || vn >= 0) {
			continue;
		}
		touched = true;
		if (o.kind !== 'bumper') {
			continue;
		}
		const rx = vx - 2 * vn * n.x;
		const ry = vy - 2 * vn * n.y;
		const rl = Math.hypot(rx, ry) || 1;
		const dx = rx / rl + n.x;
		const dy = ry / rl + n.y;
		const dl = Math.hypot(dx, dy) || 1;
		const kick = Math.max(BUMPER_KICK, BUMPER_SPEEDUP * Math.hypot(vx, vy));
		k.x = (dx / dl) * kick;
		k.y = (dy / dl) * kick;
		kicked = true;
	}
	const kx = k.x * KNOCK_DECAY;
	const ky = k.y * KNOCK_DECAY;
	const stopped = Math.hypot(kx, ky) < KNOCK_STOP;
	return { pos: p, knock: stopped ? { x: 0, y: 0 } : { x: kx, y: ky }, touched, kicked };
}

/** Direction for held keys: unit length, diagonals normalised, opposite keys cancel. */
export function inputToMove(input: InputState): Move {
	const x = Number(input.right) - Number(input.left);
	const y = Number(input.down) - Number(input.up);
	const length = Math.hypot(x, y);
	return length === 0 ? { ...NO_MOVE } : { x: x / length, y: y / length };
}

/** True if two circles overlap (touching edges do not count). */
export function circlesOverlap(a: Vec, ra: number, b: Vec, rb: number): boolean {
	return Math.hypot(a.x - b.x, a.y - b.y) < ra + rb;
}

/** Uniform random centre for a circle of `radius` fully inside the arena. */
export function randomPointInArena(radius: number, rng: () => number = Math.random): Vec {
	const b = innerBounds(radius);
	const x = b.minX + rng() * (b.maxX - b.minX);
	const y = b.minY + rng() * (b.maxY - b.minY);
	return { x, y };
}

/** Random position for a circle of `radius` not overlapping `avoid`; gives up after a few tries. */
export function pickSpawn(
	radius: number,
	avoid: Circle[],
	rng: () => number = Math.random,
	obstacles: readonly Obstacle[] = NO_OBSTACLES,
): Vec {
	const blocked = (p: Vec) => obstacles.some((o) => obstacleGap(o, p) < radius);
	let candidate = randomPointInArena(radius, rng);
	for (let attempt = 1; attempt < COIN_SPAWN_ATTEMPTS; attempt++) {
		if (!blocked(candidate) && !avoid.some((c) => circlesOverlap(c, c.r, candidate, radius))) {
			return candidate;
		}
		candidate = randomPointInArena(radius, rng);
	}
	for (let attempt = 0; attempt < 200 && blocked(candidate); attempt++) {
		candidate = randomPointInArena(radius, rng);
	}
	return candidate;
}

/** Random coin position not overlapping any player. */
export function pickCoinSpawn(players: Vec[], rng: () => number = Math.random): Vec {
	const avoid = players.map((p) => ({ x: p.x, y: p.y, r: PLAYER_RADIUS }));
	return pickSpawn(COIN_RADIUS, avoid, rng);
}

/** Combined movement speed factor of a player's active effects. */
export function speedMultiplier(kinds: Iterable<ItemKind>): number {
	let factor = 1;
	for (const kind of kinds) {
		if (kind === 'speed') factor *= SPEED_BOOST;
		if (kind === 'slow') factor *= SLOW_FACTOR;
	}
	return factor;
}

/** Move `pos` up to `maxStep` toward `target` without overshooting, kept inside the arena. */
export function pullToward(pos: Vec, target: Vec, maxStep: number, radius: number): Vec {
	const dx = target.x - pos.x;
	const dy = target.y - pos.y;
	const distance = Math.hypot(dx, dy);
	const next =
		distance <= maxStep
			? { x: target.x, y: target.y }
			: { x: pos.x + (dx / distance) * maxStep, y: pos.y + (dy / distance) * maxStep };
	return clampToArena(next, radius);
}

/** 1-based rank of player `id`; players with equal scores share a rank. */
export function calculateRank(
	players: { id: string; score: number }[],
	id: string,
): { rank: number; total: number } {
	const own = players.find((p) => p.id === id)?.score ?? 0;
	const higher = players.filter((p) => p.score > own).length;
	return { rank: higher + 1, total: players.length };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Validate an untrusted input message. Directions are capped at length 1; the old key-flag format
 * is converted so pages loaded before an update still move. Returns null when invalid.
 */
export function parseInputMessage(value: unknown): InputMessage | null {
	if (!isRecord(value) || !Number.isSafeInteger(value.seq) || (value.seq as number) < 0) {
		return null;
	}
	const seq = value.seq as number;
	const { move, input } = value;
	if (isRecord(move)) {
		const { x, y } = move;
		if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x + y)) {
			return null;
		}
		const length = Math.hypot(x, y);
		const parsed: InputMessage = {
			seq,
			move: length > 1 ? { x: x / length, y: y / length } : { x, y },
		};
		if (value.dash === true) {
			parsed.dash = true;
		}
		return parsed;
	}
	if (
		isRecord(input) &&
		(['up', 'down', 'left', 'right'] as const).every((k) => typeof input[k] === 'boolean')
	) {
		return { seq, move: inputToMove(input as unknown as InputState) };
	}
	return null;
}

/** Control, line-break and invisible format characters; the emoji joiner (U+200D) is allowed. */
const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]|(?!\u200D)\p{Cf}/u;
const VISIBLE_CHAR = /[^\p{Cf}\p{Z}\p{M}]/u;

/** Trimmed name if it is 1-12 code points, visible and free of control characters, else null. */
export function normalizeName(raw: string): string | null {
	const name = raw.trim();
	const length = [...name].length;
	if (length > NAME_MAX_LENGTH || FORBIDDEN_NAME_CHARS.test(name) || !VISIBLE_CHAR.test(name)) {
		return null;
	}
	return name;
}

/** Runtime shape check for untrusted join requests; name and colour are checked by `World`. */
export function isValidJoinRequest(value: unknown): value is JoinRequest {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const { name, color, token, map } = value as Record<string, unknown>;
	return (
		(map === undefined || isMapChoice(map)) &&
		typeof name === 'string' &&
		name.length <= 64 &&
		typeof color === 'string' &&
		color.length <= 64 &&
		(token === undefined || (typeof token === 'string' && token.length <= 64))
	);
}

/** Copy of `players` sorted by score (high first), then name, then id. */
export function sortScoreboard<T extends { id: string; name: string; score: number }>(
	players: T[],
): T[] {
	return [...players].sort(
		(a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
	);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A browser's secret leaderboard key: a random UUID string. */
export function isPlayerKey(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}
