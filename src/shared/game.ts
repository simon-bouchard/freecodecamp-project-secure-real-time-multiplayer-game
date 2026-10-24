import {
	COIN_RADIUS,
	COIN_SPAWN_ATTEMPTS,
	NAME_MAX_LENGTH,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	innerBounds,
} from './constants.js';
import type { InputMessage, InputState, JoinRequest, Vec } from './protocol.js';

export const NO_INPUT: InputState = { up: false, down: false, left: false, right: false };

/** Clamp a circle's centre so the whole circle stays inside the arena wall. */
export function clampToArena(pos: Vec, radius: number): Vec {
	const b = innerBounds(radius);
	return {
		x: Math.min(Math.max(pos.x, b.minX), b.maxX),
		y: Math.min(Math.max(pos.y, b.minY), b.maxY),
	};
}

/** Advance a player by `dt` seconds of `input`; diagonals are normalised, then clamped. */
export function movePlayer(pos: Vec, input: InputState, dt: number): Vec {
	const dx = Number(input.right) - Number(input.left);
	const dy = Number(input.down) - Number(input.up);
	if (dx === 0 && dy === 0) {
		return { x: pos.x, y: pos.y };
	}
	const step = (PLAYER_SPEED * dt) / Math.hypot(dx, dy);
	return clampToArena({ x: pos.x + dx * step, y: pos.y + dy * step }, PLAYER_RADIUS);
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

/** Random coin position not overlapping any player; gives up after a fixed number of tries. */
export function pickCoinSpawn(players: Vec[], rng: () => number = Math.random): Vec {
	let candidate = randomPointInArena(COIN_RADIUS, rng);
	for (let attempt = 1; attempt < COIN_SPAWN_ATTEMPTS; attempt++) {
		if (!players.some((p) => circlesOverlap(p, PLAYER_RADIUS, candidate, COIN_RADIUS))) {
			return candidate;
		}
		candidate = randomPointInArena(COIN_RADIUS, rng);
	}
	return candidate;
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

/** Runtime check for untrusted input messages from clients. */
export function isValidInputMessage(value: unknown): value is InputMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const { seq, input } = value as Record<string, unknown>;
	if (!Number.isSafeInteger(seq) || (seq as number) < 0) {
		return false;
	}
	if (typeof input !== 'object' || input === null) {
		return false;
	}
	const keys = input as Record<string, unknown>;
	return (['up', 'down', 'left', 'right'] as const).every((k) => typeof keys[k] === 'boolean');
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
