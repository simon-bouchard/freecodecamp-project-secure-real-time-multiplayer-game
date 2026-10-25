import type { Period } from '../../shared/protocol.js';

/** Start of the period containing `now`, in epoch ms, using the server's local calendar. */
export function periodStart(period: Period, now: number): number {
	if (period === 'all') {
		return 0;
	}
	const date = new Date(now);
	const day = period === 'today' ? date.getDate() : 1;
	return new Date(date.getFullYear(), date.getMonth(), day).getTime();
}
