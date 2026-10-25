import { expect, test } from 'vitest';
import { canvasPixelSize } from './canvas.js';

test.each([
	[1, { width: 640, height: 480, scale: 1 }],
	[2, { width: 1280, height: 960, scale: 2 }],
	[1.5, { width: 960, height: 720, scale: 1.5 }],
	[0.5, { width: 640, height: 480, scale: 1 }],
	[4, { width: 1920, height: 1440, scale: 3 }],
])('canvasPixelSize at dpr %d', (dpr, expected) => {
	expect(canvasPixelSize(640, 480, dpr)).toEqual(expected);
});
