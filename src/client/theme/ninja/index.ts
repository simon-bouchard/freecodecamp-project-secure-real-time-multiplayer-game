import {
	ARENA,
	BIG_COIN_RADIUS,
	CANVAS,
	COIN_RADIUS,
	ITEM_RADIUS,
	PLAYER_RADIUS,
} from '../../../shared/constants.js';
import type { ItemKind, Vec } from '../../../shared/protocol.js';
import { blinkVisible, winnerText } from '../../format.js';
import type { DrawnPlayer, FrameView } from '../../render.js';
import { roundStatus } from '../shared.js';
import type { Theme } from '../types.js';
import { drawSprite, narutomakiSprite, ramenSprite, tagSprite } from './art.js';

/** The ramen bowl is drawn this many times wider than the big pickup's hit radius. */
const RAMEN_WIDTH_FACTOR = 2.4;

function drawNarutomaki(ctx: CanvasRenderingContext2D, pos: Vec): void {
	drawSprite(ctx, narutomakiSprite(), pos.x, pos.y, COIN_RADIUS / 9);
}

/** Ramen bowl, shifted up so the bowl body (not the rim) sits on the pickup position. */
function drawRamen(ctx: CanvasRenderingContext2D, big: NonNullable<FrameView['bigCoin']>): void {
	if (!blinkVisible(big.remainingMs)) {
		return;
	}
	const scale = (BIG_COIN_RADIUS * RAMEN_WIDTH_FACTOR) / 52;
	drawSprite(ctx, ramenSprite(), big.x, big.y - 5 * scale, scale);
}

function drawTag(ctx: CanvasRenderingContext2D, item: NonNullable<FrameView['item']>): void {
	if (blinkVisible(item.remainingMs)) {
		drawSprite(ctx, tagSprite(item.kind), item.x, item.y, ITEM_RADIUS / 10);
	}
}

const COLORS = {
	background: '#232323',
	wall: '#a1a1a1',
	text: '#ffffff',
	coin: '#FFD700',
	overlay: 'rgba(0, 0, 0, 0.75)',
	coinRing: '#fff3a0',
	itemBackground: '#1a1a1a',
	effectTrack: 'rgba(255, 255, 255, 0.2)',
	slowTint: 'rgba(80, 140, 255, 0.45)',
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

/** Colour and symbol for each boost, used for board items and effect icons. */
const ITEM_STYLE: Record<ItemKind, { color: string; symbol: string }> = {
	speed: { color: '#00e5ff', symbol: '»' },
	magnet: { color: '#ff4fd8', symbol: 'U' },
	double: { color: '#ffd166', symbol: 'x2' },
	slow: { color: '#7aa2ff', symbol: '~' },
};

/** Small icons with a shrinking bar for each active effect, in a row above the name. */
function drawEffects(ctx: CanvasRenderingContext2D, player: DrawnPlayer): void {
	const size = 10;
	const gap = 3;
	const y = player.y - PLAYER_RADIUS - 28;
	let x = player.x - ((size + gap) * player.effects.length - gap) / 2;
	for (const effect of player.effects) {
		const { color } = ITEM_STYLE[effect.kind];
		ctx.fillStyle = color;
		ctx.fillRect(x, y, size, size);
		ctx.fillStyle = COLORS.effectTrack;
		ctx.fillRect(x, y + size + 1, size, 2);
		ctx.fillStyle = color;
		ctx.fillRect(x, y + size + 1, size * Math.min(1, effect.remainingMs / effect.totalMs), 2);
		x += size + gap;
	}
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: DrawnPlayer): void {
	drawSmileyFace(ctx, player, player.color);
	if (player.effects.some((e) => e.kind === 'slow')) {
		ctx.fillStyle = COLORS.slowTint;
		ctx.beginPath();
		ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
		ctx.fill();
	}
	drawEffects(ctx, player);
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

function drawArena(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = COLORS.background;
	ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
	ctx.strokeStyle = COLORS.wall;
	ctx.lineWidth = ARENA.wall;
	ctx.strokeRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
}

/** The ninja theme: training ground, headband ninjas, narutomaki, ramen and paper tags. */
export const ninjaTheme: Theme = {
	name: 'ninja',
	drawArena,
	drawHeader,
	drawPickup: drawNarutomaki,
	drawBigPickup: drawRamen,
	drawItem: drawTag,
	drawPlayer,
	drawResults,
};
