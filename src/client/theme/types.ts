import type { Vec } from '../../shared/protocol.js';
import type { DrawnItem, DrawnPlayer, FrameView } from '../render.js';
import type { Obstacle } from '../../shared/maps.js';
import type { SoundSet } from '../sound/board.js';
import type { ThemeId } from './registry.js';

/**
 * Everything that decides how the game looks. `drawFrame` calls these in order; a new visual
 * style is a new object implementing this interface (plus page CSS), with no game changes.
 */
export interface Theme {
	id: ThemeId;
	/** Class put on <body> so page CSS (panels, background) can follow the theme. */
	bodyClass: string;
	joinNameLabel: string;
	joinHint: string;
	/** Join hint shown on touch screens instead of the keyboard one. */
	joinTouchHint: string;
	/** Sounds for game moments; a theme without them is silent. */
	sounds?: SoundSet;
	/** Recorded sound files its sounds use, preloaded once audio is unlocked. */
	soundFiles?: readonly string[];
	/** Called once per frame before drawing, for themes that keep per-frame state. */
	beginFrame?(view: FrameView, now: number): void;
	/** Page background, floor and walls. */
	drawArena(ctx: CanvasRenderingContext2D): void;
	/** The current map's obstacles, drawn on the floor. */
	drawObstacles(ctx: CanvasRenderingContext2D, obstacles: readonly Obstacle[]): void;
	drawHeader(ctx: CanvasRenderingContext2D, view: FrameView): void;
	/** The regular 1-point pickup. */
	drawPickup(ctx: CanvasRenderingContext2D, pos: Vec): void;
	drawBigPickup(ctx: CanvasRenderingContext2D, big: NonNullable<FrameView['bigCoin']>): void;
	drawItem(ctx: CanvasRenderingContext2D, item: DrawnItem): void;
	drawPlayer(
		ctx: CanvasRenderingContext2D,
		player: DrawnPlayer,
		now: number,
		textScale: number,
	): void;
	drawResults(ctx: CanvasRenderingContext2D, view: FrameView): void;
}
