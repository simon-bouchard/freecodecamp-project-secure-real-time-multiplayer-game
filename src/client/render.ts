import { ARENA, CANVAS, COIN_RADIUS, PLAYER_RADIUS } from '../shared/constants.js';
import type { CoinState, RoundState, Vec } from '../shared/protocol.js';
import { formatClock, winnerText } from './format.js';

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
	overlay: 'rgba(0, 0, 0, 0.75)',
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

function drawPlayer(ctx: CanvasRenderingContext2D, player: DrawnPlayer): void {
	drawSmileyFace(ctx, player, player.color);
	if (player.self) {
		ctx.strokeStyle = COLORS.text;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(player.x, player.y, PLAYER_RADIUS + 2, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.font = '12px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillStyle = COLORS.text;
	ctx.fillText(player.name, player.x, player.y - PLAYER_RADIUS - 6);
}

function roundStatus(view: FrameView): string {
	const { round } = view;
	if (!round || round.phase === 'waiting' || round.endsAt === null) {
		return 'Waiting for players';
	}
	const left = formatClock(round.endsAt - view.serverNow);
	return round.phase === 'playing' ? `Time ${left}` : `Next round ${left}`;
}

function drawHeader(ctx: CanvasRenderingContext2D, view: FrameView): void {
	const padding = 10;
	const baseline = 32;
	ctx.font = '18px monospace';
	ctx.fillStyle = COLORS.text;

	ctx.textAlign = 'left';
	ctx.fillText(roundStatus(view), padding, baseline);
	ctx.textAlign = 'center';
	ctx.fillText('Coin Race', CANVAS.width / 2, baseline);
	ctx.textAlign = 'right';
	const { rank, total } = view.rank;
	const status = view.selfId ? `Score: ${view.score}  Rank: ${rank}/${total}` : 'Spectating';
	ctx.fillText(status, CANVAS.width - padding, baseline);
}

function drawResults(ctx: CanvasRenderingContext2D, view: FrameView): void {
	const round = view.round!;
	const centerX = ARENA.x + ARENA.width / 2;
	let y = ARENA.y + 80;

	ctx.fillStyle = COLORS.overlay;
	ctx.fillRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
	ctx.textAlign = 'center';
	ctx.fillStyle = COLORS.text;
	ctx.font = '28px monospace';
	ctx.fillText('Round over', centerX, y);

	const names = view.scoreboard.filter((r) => round.winners.includes(r.id)).map((r) => r.name);
	ctx.font = '20px monospace';
	ctx.fillStyle = COLORS.coin;
	ctx.fillText(winnerText(names), centerX, (y += 50));

	ctx.font = '16px monospace';
	view.scoreboard.slice(0, 5).forEach((row, i) => {
		ctx.fillStyle = row.color;
		ctx.fillText(`${i + 1}. ${row.name}  ${row.score}`, centerX, (y += i === 0 ? 50 : 28));
	});

	const seconds = Math.max(0, Math.ceil(((round.endsAt ?? 0) - view.serverNow) / 1000));
	ctx.fillStyle = COLORS.text;
	ctx.fillText(`Next round in ${seconds}`, centerX, ARENA.y + ARENA.height - 40);
}

/** Draw the header, arena, coin, players and results; the local player is drawn on top. */
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
		drawPlayer(ctx, player);
	}

	if (view.round?.phase === 'results') {
		drawResults(ctx, view);
	}
}
