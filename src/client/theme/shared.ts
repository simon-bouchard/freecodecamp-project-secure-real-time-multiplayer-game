import { formatClock } from '../format.js';
import type { FrameView } from '../render.js';

/** Header text for the round: time left, time to the next round, or waiting. */
export function roundStatus(view: FrameView): string {
	const { round } = view;
	if (!round || round.phase === 'waiting' || round.endsAt === null) {
		return 'Waiting for players';
	}
	const left = formatClock(round.endsAt - view.serverNow);
	return round.phase === 'playing' ? `Time ${left}` : `Next round ${left}`;
}
