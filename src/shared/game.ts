import {
	COIN_RADIUS,
	COIN_SPAWN_ATTEMPTS,
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
import type { InputMessage, InputState, ItemKind, JoinRequest, Move, Vec } from './protocol.js';

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
export function movePlayer(pos: Vec, move: Move, dt: number, speedMultiplier = 1): Vec {
	const length = Math.hypot(move.x, move.y);
	if (length === 0) {
		return { x: pos.x, y: pos.y };
	}
	const step = (PLAYER_SPEED * speedMultiplier * dt * Math.min(1, length)) / length;
	return clampToArena({ x: pos.x + move.x * step, y: pos.y + move.y * step }, PLAYER_RADIUS);
}

/**
 * One tick of knockback: move by it, bounce off walls (reversing and damping that axis), then
 * let it fade. Shared by server and client so prediction replays it exactly.
 */
export function knockStep(pos: Vec, knock: Vec): { pos: Vec; knock: Vec } {
	if (knock.x === 0 && knock.y === 0) {
		return { pos: { x: pos.x, y: pos.y }, knock: { x: 0, y: 0 } };
	}
	const moved = { x: pos.x + knock.x * TICK_DT, y: pos.y + knock.y * TICK_DT };
	const clamped = clampToArena(moved, PLAYER_RADIUS);
	const kx = (clamped.x === moved.x ? knock.x : -knock.x * WALL_BOUNCE) * KNOCK_DECAY;
	const ky = (clamped.y === moved.y ? knock.y : -knock.y * WALL_BOUNCE) * KNOCK_DECAY;
	const stopped = Math.hypot(kx, ky) < KNOCK_STOP;
	return { pos: clamped, knock: stopped ? { x: 0, y: 0 } : { x: kx, y: ky } };
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
export function pickSpawn(radius: number, avoid: Circle[], rng: () => number = Math.random): Vec {
	let candidate = randomPointInArena(radius, rng);
	for (let attempt = 1; attempt < COIN_SPAWN_ATTEMPTS; attempt++) {
		if (!avoid.some((c) => circlesOverlap(c, c.r, candidate, radius))) {
			return candidate;
		}
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
		return { seq, move: length > 1 ? { x: x / length, y: y / length } : { x, y } };
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
	const { name, color, token } = value as Record<string, unknown>;
	return (
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
