import { expect, test } from 'vitest';
import { canvasPixelSize, textScale } from './canvas.js';

test.each([
	[1, { width: 640, height: 480, scale: 1 }],
	[2, { width: 1280, height: 960, scale: 2 }],
	[1.5, { width: 960, height: 720, scale: 1.5 }],
	[0.5, { width: 640, height: 480, scale: 1 }],
	[4, { width: 1920, height: 1440, scale: 3 }],
])('canvasPixelSize at dpr %d', (dpr, expected) => {
	expect(canvasPixelSize(640, 480, dpr)).toEqual(expected);
});

test.each([
	[640, 1],
	[1280, 1],
	[500, 1.28],
	[400, 1.6],
	[320, 1.6],
	[0, 1],
])('textScale for a canvas shown %d px wide is %d', (width, scale) => {
	expect(textScale(width)).toBeCloseTo(scale);
});
