/** Canvas size in pixels. */
export const CANVAS = { width: 640, height: 480 } as const;

/** Arena rectangle as drawn on the canvas; `wall` is the stroke width of its border. */
export const ARENA = { x: 5, y: 50, width: 630, height: 425, wall: 2 } as const;

export const PLAYER_RADIUS = 15;
export const COIN_RADIUS = 7;

/** Player speed in pixels per second. */
export const PLAYER_SPEED = 300;

export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;

/** How far behind the server clock other players are rendered, for interpolation. */
export const RENDER_DELAY_MS = 100;

/** Max inputs a player can apply in one tick after being idle. */
export const MAX_INPUT_CREDITS = 3;

/** Input credits earned per tick; slightly above 1 so a jitter backlog slowly drains. */
export const INPUT_RATE_TOLERANCE = 1.05;

/** Server-side input backlog per player (about 130 ms); the oldest inputs are dropped beyond it. */
export const MAX_QUEUED_INPUTS = 4;

/** How much snapshot history the client keeps. */
export const SNAPSHOT_BUFFER_MS = 1000;

/** Prediction corrections larger than this snap instead of being smoothed. */
export const SNAP_DISTANCE = 50;

export const COIN_SPAWN_ATTEMPTS = 20;

/** Range of valid centres for a circle of the given radius. */
export interface Bounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/** Valid centre range for a circle of `radius` that lies fully inside the inner edge of the wall. */
export function innerBounds(radius: number): Bounds {
	const inset = ARENA.wall / 2 + radius;
	return {
		minX: ARENA.x + inset,
		maxX: ARENA.x + ARENA.width - inset,
		minY: ARENA.y + inset,
		maxY: ARENA.y + ARENA.height - inset,
	};
}

/** Player colours, one each; chosen to be far apart perceptually and from the coin's gold. */
export const PALETTE: readonly string[] = [
	'#1aecff',
	'#1782cf',
	'#8270db',
	'#dfb3ff',
	'#e600d2',
	'#ff80b5',
	'#ff1a53',
	'#ff531a',
	'#e68600',
	'#66ff1a',
	'#2eb87e',
	'#80ffd4',
];

export const MAX_PLAYERS = PALETTE.length;
export const NAME_MAX_LENGTH = 12;

export const ROUND_TICKS = 60 * TICK_RATE;
export const RESULTS_TICKS = 8 * TICK_RATE;
