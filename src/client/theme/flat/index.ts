import {
	ARENA,
	BIG_COIN_RADIUS,
	CANVAS,
	COIN_RADIUS,
	ITEM_RADIUS,
	PLAYER_RADIUS,
} from '../../../shared/constants.js';
import type { ItemKind, Vec } from '../../../shared/protocol.js';
import { blinkVisible, ordinal, winnerText } from '../../format.js';
import type { DrawnItem, DrawnPlayer, FrameView } from '../../render.js';
import { labelLayout, labelX } from '../layout.js';
import { drawHeaderTexts, drawResultRows, roundStatus } from '../shared.js';
import { SmokeTrail } from '../trail.js';
import type { Theme } from '../types.js';
import { wavyRingPath } from './geometry.js';
import { flatSounds } from '../../sound/flat.js';

const COLORS = {
	page: '#20242c',
	header: '#1b1e25',
	arena: '#2a2f39',
	text: '#e6e8ee',
	muted: '#9aa3b2',
	gold: '#ffcc33',
	symbol: '#1b1e25',
	slow: '#5b7cff',
	dim: 'rgba(20, 22, 28, 0.7)',
	card: '#323844',
	cardEdge: 'rgba(255, 255, 255, 0.1)',
} as const;

const FONT = 'system-ui, sans-serif';

/** Badge colour per boost kind. */
const BADGE_COLORS: Record<ItemKind, string> = {
	speed: '#36d1ff',
	magnet: '#c03ad6',
	double: '#ffcc33',
	slow: '#5b7cff',
};

/** Boost symbols drawn inside a badge of radius 6 (scaled for other sizes). */
const SYMBOLS: Record<Exclude<ItemKind, 'double'>, { path: string; width: number }> = {
	speed: { path: 'M-3.5 -3 l3 3 l-3 3 M0.5 -3 l3 3 l-3 3', width: 1.6 },
	magnet: { path: 'M-3 -3 v2.5 a3 3 0 0 0 6 0 v-2.5', width: 1.8 },
	slow: { path: 'M-3.5 0.5 q1.75 -2.6 3.5 0 q1.75 2.6 3.5 0', width: 1.6 },
};

const trail = new SmokeTrail();
let slowRing: Path2D | null = null;
const symbolPaths = new Map<ItemKind, Path2D>();

function symbolPath(kind: Exclude<ItemKind, 'double'>): Path2D {
	let path = symbolPaths.get(kind);
	if (!path) {
		path = new Path2D(SYMBOLS[kind].path);
		symbolPaths.set(kind, path);
	}
	return path;
}

/** Round boost badge: a coloured disc with the boost's symbol in dark ink. */
function drawBadge(
	ctx: CanvasRenderingContext2D,
	kind: ItemKind,
	x: number,
	y: number,
	r: number,
): void {
	ctx.fillStyle = BADGE_COLORS[kind];
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(r / 6, r / 6);
	if (kind === 'double') {
		ctx.fillStyle = COLORS.symbol;
		ctx.font = `800 6.5px ${FONT}`;
		ctx.textAlign = 'center';
		ctx.fillText('x2', 0, 2.6);
	} else {
		ctx.strokeStyle = COLORS.symbol;
		ctx.lineWidth = SYMBOLS[kind].width;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(symbolPath(kind));
	}
	ctx.restore();
}

function beginFrame(view: FrameView): void {
	trail.forget(new Set(view.players.map((p) => p.id)));
}

function drawArena(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = COLORS.page;
	ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
	ctx.fillStyle = COLORS.arena;
	ctx.beginPath();
	ctx.roundRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height, 14);
	ctx.fill();
}

function drawHeader(ctx: CanvasRenderingContext2D, view: FrameView): void {
	ctx.fillStyle = COLORS.header;
	ctx.fillRect(0, 0, CANVAS.width, 46);
	ctx.fillStyle = COLORS.text;
	const { rank, total } = view.rank;
	drawHeaderTexts(ctx, view.textScale, 24, {
		left: { text: roundStatus(view), size: 16, font: (px) => `600 ${px}px ${FONT}` },
		title: { text: 'COIN RACE', size: 18, font: (px) => `700 ${px}px ${FONT}`, letterSpacing: 3 },
		right: {
			text: view.selfId ? `${view.score} · ${ordinal(rank)}/${total}` : 'Spectating',
			size: 15,
			font: (px) => `600 ${px}px ${FONT}`,
		},
	});
}

function drawPickup(ctx: CanvasRenderingContext2D, pos: Vec): void {
	ctx.fillStyle = COLORS.gold;
	ctx.beginPath();
	ctx.arc(pos.x, pos.y, COIN_RADIUS, 0, Math.PI * 2);
	ctx.fill();
}

/** The big pickup is a thick gold ring. */
function drawBigPickup(
	ctx: CanvasRenderingContext2D,
	big: NonNullable<FrameView['bigCoin']>,
): void {
	if (!blinkVisible(big.remainingMs)) {
		return;
	}
	ctx.strokeStyle = COLORS.gold;
	ctx.lineWidth = BIG_COIN_RADIUS * 0.45;
	ctx.beginPath();
	ctx.arc(big.x, big.y, BIG_COIN_RADIUS - ctx.lineWidth / 2, 0, Math.PI * 2);
	ctx.stroke();
}

function drawItem(ctx: CanvasRenderingContext2D, item: DrawnItem): void {
	if (blinkVisible(item.remainingMs)) {
		drawBadge(ctx, item.kind, item.x, item.y, ITEM_RADIUS);
	}
}

function drawPlayer(
	ctx: CanvasRenderingContext2D,
	player: DrawnPlayer,
	now: number,
	textScale: number,
): void {
	const boosted = player.effects.some((e) => e.kind === 'speed');
	const slowed = player.effects.some((e) => e.kind === 'slow');

	trail.update(player.id, player, boosted, now);
	ctx.fillStyle = player.color;
	for (const puff of trail.puffs(player.id, now)) {
		ctx.globalAlpha = puff.alpha;
		ctx.beginPath();
		ctx.arc(puff.x, puff.y - 2, PLAYER_RADIUS * (0.55 + puff.alpha), 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.globalAlpha = slowed ? 0.35 : 1;
	ctx.beginPath();
	ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalAlpha = 1;

	if (slowed) {
		slowRing ??= new Path2D(wavyRingPath(19.5, 14, 1.1));
		ctx.save();
		ctx.translate(player.x, player.y);
		ctx.strokeStyle = COLORS.slow;
		ctx.lineWidth = 2;
		ctx.lineJoin = 'round';
		ctx.stroke(slowRing);
		ctx.restore();
	}
	if (player.self) {
		ctx.strokeStyle = COLORS.text;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(player.x, player.y, PLAYER_RADIUS + 4, 0, Math.PI * 2);
		ctx.stroke();
	}

	const { nameY, tagsY } = labelLayout(player.y, textScale);
	ctx.font = `600 ${Math.round(12 * textScale)}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.fillStyle = slowed ? COLORS.muted : COLORS.text;
	ctx.fillText(player.name, labelX(player.x, ctx.measureText(player.name).width + 4), nameY);

	const spacing = 16;
	const rowWidth = spacing * (player.effects.length - 1) + 12;
	let x = labelX(player.x, rowWidth) - (spacing * (player.effects.length - 1)) / 2;
	for (const effect of player.effects) {
		drawBadge(ctx, effect.kind, x, tagsY, 6);
		x += spacing;
	}
}

/** Results on a centred flat card. */
function drawResults(ctx: CanvasRenderingContext2D, view: FrameView): void {
	const round = view.round!;
	ctx.fillStyle = COLORS.dim;
	ctx.beginPath();
	ctx.roundRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height, 14);
	ctx.fill();

	const width = 320;
	const height = 270;
	const x = (CANVAS.width - width) / 2;
	const y = 115;
	ctx.fillStyle = COLORS.card;
	ctx.strokeStyle = COLORS.cardEdge;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, 12);
	ctx.fill();
	ctx.stroke();

	const centerX = CANVAS.width / 2;
	ctx.textAlign = 'center';
	ctx.fillStyle = COLORS.text;
	ctx.font = `700 24px ${FONT}`;
	ctx.fillText('Round over', centerX, y + 46);

	const names = view.scoreboard.filter((r) => round.winners.includes(r.id)).map((r) => r.name);
	ctx.fillStyle = COLORS.gold;
	ctx.font = `700 18px ${FONT}`;
	ctx.fillText(winnerText(names), centerX, y + 82, width - 40);

	ctx.font = `600 15px ${FONT}`;
	drawResultRows(ctx, view, {
		centerX,
		top: y + 122,
		rowGap: 23,
		maxWidth: width - 40,
		font: `600 15px ${FONT}`,
		rowColor: (row) => row.color,
		highlightFont: `700 11px ${FONT}`,
		highlightColor: COLORS.gold,
	});

	const seconds = Math.max(0, Math.ceil(((round.endsAt ?? 0) - view.serverNow) / 1000));
	ctx.fillStyle = COLORS.muted;
	ctx.font = `14px ${FONT}`;
	ctx.fillText(`Next round in ${seconds}`, centerX, y + height - 22);
}

/** Plain flat shapes: solid discs on dark slate, gold dots and rings, round boost badges. */
export const flatTheme: Theme = {
	id: 'flat',
	bodyClass: 'theme-flat',
	joinNameLabel: 'Name',
	joinHint: 'WASD or arrow keys. Grab the gold!',
	joinTouchHint: 'Touch where you want to go. Grab the gold!',
	sounds: flatSounds,
	beginFrame,
	drawArena,
	drawHeader,
	drawPickup,
	drawBigPickup,
	drawItem,
	drawPlayer,
	drawResults,
};
