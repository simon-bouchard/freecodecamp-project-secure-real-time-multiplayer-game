import { ARENA, PLAYER_RADIUS } from '../../shared/constants.js';

const NAME_GAP = 9;
const TAGS_ABOVE_NAME = 20;
/** Half the height of a mini effect tag, so the whole tag stays clear of the header. */
const TAG_HALF_HEIGHT = 8;

/**
 * Baselines for a player's name and effect tags: above the player, or below near the top wall.
 * `scale` is the text scale, so larger names leave room for the tags.
 */
export function labelLayout(playerY: number, scale = 1): { nameY: number; tagsY: number } {
	const nameY = playerY - PLAYER_RADIUS - NAME_GAP;
	const tagsY = nameY - TAGS_ABOVE_NAME * scale;
	if (tagsY - TAG_HALF_HEIGHT * scale >= ARENA.y) {
		return { nameY, tagsY };
	}
	const below = playerY + PLAYER_RADIUS + NAME_GAP + 12 * scale;
	return { nameY: below, tagsY: below + (TAGS_ABOVE_NAME - 4) * scale };
}

/** Horizontal centre for a label of `width` near `playerX`, kept inside the arena walls. */
export function labelX(playerX: number, width: number): number {
	const min = ARENA.x + 2 + width / 2;
	const max = ARENA.x + ARENA.width - 2 - width / 2;
	return Math.min(Math.max(playerX, min), max);
}
