import {
	ARENA,
	BIG_COIN_RADIUS,
	CANVAS,
	COIN_RADIUS,
	ITEM_RADIUS,
	PLAYER_RADIUS,
} from '../../../shared/constants.js';
import type { Vec } from '../../../shared/protocol.js';
import { blinkVisible, ordinal, winnerText } from '../../format.js';
import type { DrawnPlayer, FrameView } from '../../render.js';
import { drawHeaderTexts, drawResultRows, roundStatus } from '../shared.js';
import type { Theme } from '../types.js';
import {
	TAG_COLORS,
	type Sprite,
	drawSprite,
	narutomakiSprite,
	ramenSprite,
	tagSprite,
} from './art.js';
import { PAPER, mulberry32, readableOnPaper } from './geometry.js';
import { labelLayout, labelX } from '../layout.js';
import { SmokeTrail } from '../trail.js';
import { ninjaSounds } from '../../sound/ninja.js';

const COLORS = {
	page: '#2a1c11',
	wood: '#3e2a1a',
	woodDark: '#2a1c11',
	woodLine: '#4b3322',
	border: '#5b3f26',
	sand: '#cdac78',
	speckle: '#b38f58',
	cream: '#f3e6c4',
	ink: '#2a1a14',
	nameHalo: '#e8d7b0',
	headband: '#2b2f3a',
	plate: '#cfd5de',
	plateEdge: '#7b8494',
	selfRing: '#fffaf0',
	slowTint: 'rgba(77, 107, 214, 0.32)',
	slowText: '#2b4a9a',
	smoke: '#efe4d0',
	dim: 'rgba(26, 18, 11, 0.6)',
	scrollRod: '#7a2e1d',
	scrollEdge: '#5a3a1a',
	winner: '#b5321f',
	muted: '#6b5640',
} as const;

/** The ramen bowl is drawn this many times wider than the big pickup's hit radius. */
const RAMEN_WIDTH_FACTOR = 2.4;
const CORNER_POSTS: readonly Vec[] = [
	{ x: 28, y: 78 },
	{ x: 612, y: 78 },
	{ x: 28, y: 452 },
	{ x: 612, y: 452 },
];

const smoke = new SmokeTrail();
let floorSprite: Sprite | null = null;

/** Sandy training-ground floor with fixed speckles, rendered once. */
function floor(): Sprite {
	if (!floorSprite) {
		const canvas = document.createElement('canvas');
		const scale = 2;
		canvas.width = ARENA.width * scale;
		canvas.height = ARENA.height * scale;
		const ctx = canvas.getContext('2d')!;
		ctx.scale(scale, scale);
		ctx.fillStyle = COLORS.sand;
		ctx.fillRect(0, 0, ARENA.width, ARENA.height);
		const rnd = mulberry32(42);
		ctx.fillStyle = COLORS.speckle;
		for (let i = 0; i < 220; i++) {
			ctx.beginPath();
			ctx.arc(rnd() * ARENA.width, rnd() * ARENA.height, 0.8 + rnd() * 0.9, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.strokeStyle = '#bf9c66';
		ctx.lineWidth = 1.4;
		for (let i = 0; i < 40; i++) {
			const x = rnd() * ARENA.width;
			const y = rnd() * ARENA.height;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.quadraticCurveTo(x + 6, y - 2, x + 12, y);
			ctx.stroke();
		}
		floorSprite = { canvas, width: ARENA.width, height: ARENA.height, originX: 0, originY: 0 };
	}
	return floorSprite;
}

function drawPost(ctx: CanvasRenderingContext2D, { x, y }: Vec): void {
	ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
	ctx.beginPath();
	ctx.ellipse(x, y + 10, 10, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#7a5532';
	ctx.strokeStyle = '#4a311c';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.roundRect(x - 7, y - 14, 14, 24, 3);
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = '#a5784a';
	ctx.lineWidth = 1.2;
	ctx.beginPath();
	ctx.ellipse(x, y - 14, 7, 2.6, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
}

/** Page background, sand floor, a thick wood border drawn outside the walls, corner posts. */
function drawArena(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = COLORS.page;
	ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
	drawSprite(ctx, floor(), ARENA.x, ARENA.y);
	ctx.strokeStyle = COLORS.border;
	ctx.lineWidth = 5;
	ctx.strokeRect(ARENA.x - 1.5, ARENA.y - 1.5, ARENA.width + 3, ARENA.height + 3);
	CORNER_POSTS.forEach((post) => drawPost(ctx, post));
}

/** Drop smoke trails of players who left. */
function beginFrame(view: FrameView): void {
	smoke.forget(new Set(view.players.map((p) => p.id)));
}

function drawHeader(ctx: CanvasRenderingContext2D, view: FrameView): void {
	ctx.fillStyle = COLORS.wood;
	ctx.fillRect(0, 0, CANVAS.width, 46);
	ctx.fillStyle = COLORS.woodDark;
	ctx.fillRect(0, 40, CANVAS.width, 6);
	ctx.strokeStyle = COLORS.woodLine;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, 12);
	ctx.lineTo(CANVAS.width, 12);
	ctx.moveTo(0, 28);
	ctx.lineTo(CANVAS.width, 28);
	ctx.stroke();

	ctx.fillStyle = COLORS.cream;
	const { rank, total } = view.rank;
	const sans = (px: number) => `bold ${px}px system-ui, sans-serif`;
	drawHeaderTexts(ctx, view.textScale, 24, {
		left: { text: roundStatus(view), size: 17, font: sans },
		title: {
			text: 'COIN RACE',
			size: 21,
			font: (px) => `bold ${px}px Georgia, "Times New Roman", serif`,
			letterSpacing: 2,
		},
		right: {
			text: view.selfId ? `Score ${view.score} · ${ordinal(rank)}/${total}` : 'Spectating',
			size: 15,
			font: sans,
		},
	});
}

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

/** Mini paper tags with a timer bar for each active effect, in a row centred on (`cx`, `y`). */
function drawEffects(
	ctx: CanvasRenderingContext2D,
	player: DrawnPlayer,
	cx: number,
	y: number,
): void {
	const spacing = 12;
	const rowWidth = spacing * (player.effects.length - 1) + 10;
	let x = labelX(cx, rowWidth) - (spacing * (player.effects.length - 1)) / 2;
	for (const effect of player.effects) {
		drawSprite(ctx, tagSprite(effect.kind), x, y, 0.5);
		const fraction = Math.min(1, effect.remainingMs / effect.totalMs);
		ctx.fillStyle = 'rgba(90, 58, 26, 0.3)';
		ctx.fillRect(x - 5, y + 9, 10, 2);
		ctx.fillStyle = TAG_COLORS[effect.kind];
		ctx.fillRect(x - 5, y + 9, 10 * fraction, 2);
		x += spacing;
	}
}

function drawNinja(ctx: CanvasRenderingContext2D, { x, y }: Vec, color: string): void {
	const r = PLAYER_RADIUS;
	ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
	ctx.beginPath();
	ctx.ellipse(x, y + 15, 14, 4, 0, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = color;
	ctx.strokeStyle = COLORS.ink;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();

	ctx.save();
	ctx.beginPath();
	ctx.arc(x, y, r - 1, 0, Math.PI * 2);
	ctx.clip();
	ctx.fillStyle = COLORS.headband;
	ctx.fillRect(x - r, y - 8, r * 2, 7);
	ctx.restore();

	ctx.fillStyle = COLORS.plate;
	ctx.strokeStyle = COLORS.plateEdge;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(x - 6, y - 9, 12, 9, 1.5);
	ctx.fill();
	ctx.stroke();
}

function drawPlayer(
	ctx: CanvasRenderingContext2D,
	player: DrawnPlayer,
	now: number,
	textScale: number,
): void {
	const boosted = player.effects.some((e) => e.kind === 'speed');
	const slowed = player.effects.some((e) => e.kind === 'slow');

	smoke.update(player.id, player, boosted, now);
	ctx.fillStyle = COLORS.smoke;
	for (const puff of smoke.puffs(player.id, now)) {
		ctx.globalAlpha = puff.alpha;
		ctx.beginPath();
		ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = slowed ? 0.55 : 1;
	drawNinja(ctx, player, player.color);
	ctx.globalAlpha = 1;

	if (slowed) {
		ctx.fillStyle = COLORS.slowTint;
		ctx.beginPath();
		ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = COLORS.slowText;
		ctx.font = 'bold 11px sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText('z z', player.x + 18, player.y - 14);
	}
	if (player.self) {
		ctx.strokeStyle = COLORS.selfRing;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(player.x, player.y, PLAYER_RADIUS + 3, 0, Math.PI * 2);
		ctx.stroke();
	}

	const { nameY, tagsY } = labelLayout(player.y, textScale);
	ctx.font = `bold ${Math.round(12 * textScale)}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = COLORS.nameHalo;
	ctx.lineWidth = 3;
	const nameX = labelX(player.x, ctx.measureText(player.name).width + 4);
	ctx.strokeText(player.name, nameX, nameY);
	ctx.fillStyle = COLORS.ink;
	ctx.fillText(player.name, nameX, nameY);
	drawEffects(ctx, player, player.x, tagsY);
}

/** Results on an unrolled paper scroll with dark red rods. */
function drawResults(ctx: CanvasRenderingContext2D, view: FrameView): void {
	const round = view.round!;
	ctx.fillStyle = COLORS.dim;
	ctx.fillRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);

	const x = 160;
	const y = 110;
	const width = 320;
	const height = 280;
	ctx.fillStyle = COLORS.scrollRod;
	for (const rodX of [x - 12, x + width - 12]) {
		ctx.beginPath();
		ctx.roundRect(rodX, y - 8, 24, height + 16, 12);
		ctx.fill();
	}
	ctx.fillStyle = PAPER;
	ctx.strokeStyle = COLORS.scrollEdge;
	ctx.lineWidth = 2;
	ctx.fillRect(x, y, width, height);
	ctx.strokeRect(x, y, width, height);

	const centerX = x + width / 2;
	ctx.textAlign = 'center';
	ctx.fillStyle = COLORS.ink;
	ctx.font = 'bold 26px Georgia, "Times New Roman", serif';
	ctx.fillText('Round over', centerX, y + 46);

	const names = view.scoreboard.filter((r) => round.winners.includes(r.id)).map((r) => r.name);
	ctx.fillStyle = COLORS.winner;
	ctx.font = 'bold 19px system-ui, sans-serif';
	ctx.fillText(winnerText(names), centerX, y + 84, width - 40);

	ctx.font = 'bold 15px system-ui, sans-serif';
	drawResultRows(ctx, view, {
		centerX,
		top: y + 126,
		rowGap: 24,
		maxWidth: width - 40,
		font: 'bold 15px system-ui, sans-serif',
		rowColor: (row) => readableOnPaper(row.color),
		highlightFont: 'bold 11px system-ui, sans-serif',
		highlightColor: COLORS.winner,
	});

	const seconds = Math.max(0, Math.ceil(((round.endsAt ?? 0) - view.serverNow) / 1000));
	ctx.fillStyle = COLORS.muted;
	ctx.font = '14px system-ui, sans-serif';
	ctx.fillText(`Next round in ${seconds}`, centerX, y + height - 32);
}

/** The ninja theme: training ground, headband ninjas, narutomaki, ramen and paper tags. */
export const ninjaTheme: Theme = {
	id: 'ninja',
	bodyClass: 'theme-ninja',
	joinNameLabel: 'Ninja name',
	joinHint: 'WASD or arrow keys. Grab the narutomaki!',
	joinTouchHint: 'Touch where you want to go. Grab the narutomaki!',
	sounds: ninjaSounds,
	beginFrame,
	drawArena,
	drawHeader,
	drawPickup: drawNarutomaki,
	drawBigPickup: drawRamen,
	drawItem: drawTag,
	drawPlayer,
	drawResults,
};
