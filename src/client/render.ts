import type { ItemKind, RoundState, Vec } from '../shared/protocol.js';
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

/** Everything needed to draw one frame. */
export interface FrameView {
	players: DrawnPlayer[];
	coin: Vec | null;
	bigCoin: { x: number; y: number; remainingMs: number } | null;
	item: { kind: ItemKind; x: number; y: number; remainingMs: number } | null;
	selfId: string | null;
	score: number;
	rank: { rank: number; total: number };
	round: RoundState | null;
	serverNow: number;
	scoreboard: ScoreRow[];
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
	if (view.item) {
		theme.drawItem(ctx, view.item);
	}
	const ordered = [...view.players].sort((a, b) => Number(a.self) - Number(b.self));
	for (const player of ordered) {
		theme.drawPlayer(ctx, player, now);
	}
	if (view.round?.phase === 'results') {
		theme.drawResults(ctx, view);
	}
}
