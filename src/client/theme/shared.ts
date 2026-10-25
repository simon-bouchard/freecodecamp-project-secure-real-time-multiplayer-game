import { formatClock, highlightText } from '../format.js';
import type { FrameView, ScoreRow } from '../render.js';

/** Header text for the round: time left, time to the next round, or waiting. */
export function roundStatus(view: FrameView): string {
	const { round } = view;
	if (!round || round.phase === 'waiting' || round.endsAt === null) {
		return 'Waiting for players';
	}
	const left = formatClock(round.endsAt - view.serverNow);
	return round.phase === 'playing' ? `Time ${left}` : `Next round ${left}`;
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
