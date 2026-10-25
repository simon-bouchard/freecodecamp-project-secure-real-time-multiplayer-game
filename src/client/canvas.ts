import { CANVAS } from '../shared/constants.js';

/** Backing-store size for a canvas drawn at `dpr`, clamped to 1-3 to bound memory. */
export function canvasPixelSize(
	cssWidth: number,
	cssHeight: number,
	dpr: number,
): { width: number; height: number; scale: number } {
	const scale = Math.min(3, Math.max(1, dpr));
	return { width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale), scale };
}

/** Size the canvas for the screen's pixel density while keeping 640x480 drawing units. */
export function fitCanvasToScreen(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
	const size = canvasPixelSize(CANVAS.width, CANVAS.height, window.devicePixelRatio || 1);
	if (canvas.width !== size.width || canvas.height !== size.height) {
		canvas.width = size.width;
		canvas.height = size.height;
	}
	ctx.setTransform(size.scale, 0, 0, size.scale, 0, 0);
}
