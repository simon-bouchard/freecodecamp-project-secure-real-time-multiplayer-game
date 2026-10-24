import {
	COIN_RADIUS,
	COIN_SPAWN_ATTEMPTS,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	innerBounds,
} from './constants.js';
import type { InputMessage, InputState, Vec } from './protocol.js';

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
