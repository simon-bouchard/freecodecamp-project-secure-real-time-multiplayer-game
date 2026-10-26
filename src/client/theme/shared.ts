import { MAPS } from '../../shared/maps.js';
import { CANVAS } from '../../shared/constants.js';
import { formatClock, highlightText } from '../format.js';
import type { FrameView, ScoreRow } from '../render.js';

/** Header text for the round: time left, time to the next round, or waiting. */
export function roundStatus(view: FrameView): string {
	const { round } = view;
	if (!round || round.phase === 'waiting' || round.endsAt === null) {
		return 'Waiting for players';
	}
	const left = formatClock(round.endsAt - view.serverNow);
	if (round.phase === 'voting') {
		return `Map vote ${left}`;
	}
	return round.phase === 'playing'
		? `Time ${left} · ${MAPS[round.map].name}`
		: `Next round ${left}`;
}

/** Styling for the ranked list on the round-over screen. */
export interface ResultRowsStyle {
	centerX: number;
	top: number;
	rowGap: number;
	maxWidth: number;
	font: string;
	rowColor: (row: ScoreRow) => string;
	highlightFont: string;
	highlightColor: string;
}

/** Top 5 results, each followed by a "New best…" line when that player just set one. */
export function drawResultRows(
	ctx: CanvasRenderingContext2D,
	view: FrameView,
	style: ResultRowsStyle,
): void {
	ctx.textAlign = 'center';
	let y = style.top;
	view.scoreboard.slice(0, 5).forEach((row, i) => {
		ctx.font = style.font;
		ctx.fillStyle = style.rowColor(row);
		ctx.fillText(`${i + 1}. ${row.name}  ${row.score}`, style.centerX, y, style.maxWidth);
		const period = view.highlights.get(row.id);
		if (period) {
			y += 15;
			ctx.font = style.highlightFont;
			ctx.fillStyle = style.highlightColor;
			ctx.fillText(highlightText(period), style.centerX, y, style.maxWidth);
		}
		y += style.rowGap;
	});
}

/** One piece of header text: its CSS font for a given pixel size, and that size at scale 1. */
export interface HeaderPart {
	text: string;
	size: number;
	font: (px: number) => string;
	letterSpacing?: number;
}

/**
 * Left status, centred title and right status in the header band, scaled for small screens.
 * The side texts are squeezed rather than allowed to run into the title.
 */
export function drawHeaderTexts(
	ctx: CanvasRenderingContext2D,
	scale: number,
	middleY: number,
	parts: { left: HeaderPart; title: HeaderPart; right: HeaderPart },
	padding = 14,
): void {
	const sized = (part: HeaderPart) => {
		ctx.font = part.font(Math.round(part.size * scale));
		ctx.letterSpacing = `${(part.letterSpacing ?? 0) * scale}px`;
	};
	ctx.textBaseline = 'middle';

	sized(parts.title);
	const titleWidth = ctx.measureText(parts.title.text).width;
	ctx.textAlign = 'center';
	ctx.fillText(parts.title.text, CANVAS.width / 2, middleY);

	const sideWidth = Math.max(40, CANVAS.width / 2 - titleWidth / 2 - padding - 10);
	sized(parts.left);
	ctx.textAlign = 'left';
	ctx.fillText(parts.left.text, padding, middleY, sideWidth);
	sized(parts.right);
	ctx.textAlign = 'right';
	ctx.fillText(parts.right.text, CANVAS.width - padding, middleY, sideWidth);

	ctx.letterSpacing = '0px';
	ctx.textBaseline = 'alphabetic';
}
