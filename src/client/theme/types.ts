import type { Vec } from '../../shared/protocol.js';
import type { DrawnPlayer, FrameView } from '../render.js';

/**
 * Everything that decides how the game looks. `drawFrame` calls these in order; a new visual
 * style is a new object implementing this interface (plus page CSS), with no game changes.
 */
export interface Theme {
	name: string;
	/** Page background, floor and walls. */
	drawArena(ctx: CanvasRenderingContext2D): void;
	drawHeader(ctx: CanvasRenderingContext2D, view: FrameView): void;
	/** The regular 1-point pickup. */
	drawPickup(ctx: CanvasRenderingContext2D, pos: Vec): void;
	drawBigPickup(ctx: CanvasRenderingContext2D, big: NonNullable<FrameView['bigCoin']>): void;
	drawItem(ctx: CanvasRenderingContext2D, item: NonNullable<FrameView['item']>): void;
	drawPlayer(ctx: CanvasRenderingContext2D, player: DrawnPlayer, now: number): void;
	drawResults(ctx: CanvasRenderingContext2D, view: FrameView): void;
}
