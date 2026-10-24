import { ARENA, CANVAS, COIN_RADIUS, PLAYER_RADIUS } from '../shared/constants.js';
import type { CoinState, RoundState, Vec } from '../shared/protocol.js';

/** A player as drawn this frame. */
export interface DrawnPlayer {
	id: string;
	x: number;
	y: number;
	name: string;
	color: string;
	self: boolean;
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
	coin: CoinState | null;
	selfId: string | null;
	score: number;
	rank: { rank: number; total: number };
	round: RoundState | null;
	serverNow: number;
	scoreboard: ScoreRow[];
}

const COLORS = {
	background: '#232323',
	wall: '#a1a1a1',
	text: '#ffffff',
	coin: '#FFD700',
} as const;

function drawSmileyFace(ctx: CanvasRenderingContext2D, pos: Vec, color: string): void {
	const r = PLAYER_RADIUS;
	ctx.lineWidth = 1;
	ctx.fillStyle = color;
	ctx.strokeStyle = 'black';
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = 'black';
	for (const side of [-1, 1]) {
		ctx.beginPath();
		ctx.arc(pos.x + (side * r) / 3, pos.y - r / 3, r / 6, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.beginPath();
	ctx.arc(pos.x, pos.y + r / 6, r / 2, 0, Math.PI);
	ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D, view: FrameView): void {
	const padding = 10;
	const baseline = 32;
	ctx.font = '18px monospace';
	ctx.fillStyle = COLORS.text;

	ctx.textAlign = 'left';
	ctx.fillText('Controls: WASD', padding, baseline);
	ctx.textAlign = 'center';
	ctx.fillText('Coin Race', CANVAS.width / 2, baseline);
	ctx.textAlign = 'right';
	const { rank, total } = view.rank;
	ctx.fillText(`Score: ${view.score}  Rank: ${rank}/${total}`, CANVAS.width - padding, baseline);
}

/** Draw the header, arena, coin and players; the local player is drawn last, on top. */
export function drawFrame(ctx: CanvasRenderingContext2D, view: FrameView): void {
	ctx.fillStyle = COLORS.background;
	ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

	drawHeader(ctx, view);

	ctx.strokeStyle = COLORS.wall;
	ctx.lineWidth = ARENA.wall;
	ctx.strokeRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);

	if (view.coin) {
		ctx.fillStyle = COLORS.coin;
		ctx.beginPath();
		ctx.arc(view.coin.x, view.coin.y, COIN_RADIUS, 0, Math.PI * 2);
		ctx.fill();
	}

	const ordered = [...view.players].sort((a, b) => Number(a.self) - Number(b.self));
	for (const player of ordered) {
		drawSmileyFace(ctx, player, player.color);
	}
}
