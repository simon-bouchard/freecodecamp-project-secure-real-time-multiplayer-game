import { PLAYER_RADIUS } from '../shared/constants.js';
import type { ItemKind, Period, RoundState, Vec } from '../shared/protocol.js';
import type { Theme } from './theme/types.js';

/** A player as drawn this frame. */
export interface DrawnPlayer {
	id: string;
	x: number;
	y: number;
	name: string;
	color: string;
	self: boolean;
	effects: { kind: ItemKind; remainingMs: number; totalMs: number }[];
}

/** One scoreboard line. */
export interface ScoreRow {
	id: string;
	name: string;
	color: string;
	score: number;
	self: boolean;
}

/** A boost on the board, with how long it has left. */
export interface DrawnItem {
	kind: ItemKind;
	x: number;
	y: number;
	remainingMs: number;
}

/** Everything needed to draw one frame. */
export interface FrameView {
	players: DrawnPlayer[];
	coin: Vec | null;
	bigCoin: { x: number; y: number; remainingMs: number } | null;
	items: DrawnItem[];
	selfId: string | null;
	score: number;
	rank: { rank: number; total: number };
	round: RoundState | null;
	serverNow: number;
	scoreboard: ScoreRow[];
	/** During results: players (by in-game id) who just set a new best, and in which period. */
	highlights: Map<string, Period>;
	/** Where the player is steering by touch, if they are. */
	touchTarget: Vec | null;
	/** Text enlargement for small displays (1 at full size). */
	textScale: number;
	/** How recharged our dash is, 0 to 1 (1 = ready); null when not playing. */
	dashCharge: number | null;
}

/** Ring around our player that fills while the dash recharges; brighter when ready. */
function drawDashRing(ctx: CanvasRenderingContext2D, pos: Vec, charge: number): void {
	const ready = charge >= 1;
	ctx.save();
	ctx.strokeStyle = ready ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.3)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, PLAYER_RADIUS + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
	ctx.stroke();
	ctx.restore();
}

/** Faint ring at the touch target, the same in every theme. */
function drawTouchTarget(ctx: CanvasRenderingContext2D, target: Vec): void {
	ctx.save();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
}

/** Draw one frame with `theme`; the local player is drawn last so it is on top. */
export function drawFrame(
	ctx: CanvasRenderingContext2D,
	view: FrameView,
	theme: Theme,
	now: number,
): void {
	theme.beginFrame?.(view, now);
	theme.drawArena(ctx);
	theme.drawHeader(ctx, view);
	if (view.coin) {
		theme.drawPickup(ctx, view.coin);
	}
	if (view.bigCoin) {
		theme.drawBigPickup(ctx, view.bigCoin);
	}
	for (const item of view.items) {
		theme.drawItem(ctx, item);
	}
	const ordered = [...view.players].sort((a, b) => Number(a.self) - Number(b.self));
	for (const player of ordered) {
		theme.drawPlayer(ctx, player, now, view.textScale);
	}
	const self = view.players.find((p) => p.self);
	if (self && view.dashCharge !== null && view.round?.phase === 'playing') {
		drawDashRing(ctx, self, view.dashCharge);
	}
	if (view.touchTarget) {
		drawTouchTarget(ctx, view.touchTarget);
	}
	if (view.round?.phase === 'results') {
		theme.drawResults(ctx, view);
	}
}
