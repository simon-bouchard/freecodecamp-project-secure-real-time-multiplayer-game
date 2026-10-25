import type { LeaderboardView, Period } from '../../shared/protocol.js';
import type { RoundResult } from '../world.js';
import type { RunRecord, ScoreStore } from './store.js';

/** Strongest first: an all-time record beats a monthly best, which beats a daily best. */
const PERIODS: readonly Period[] = ['all', 'month', 'today'];
const BOARD_SIZE = 10;

/**
 * Save a finished round's results and report, per player key, the strongest period in which
 * the run is a new personal best that also reaches the top 10.
 */
export function recordRound(
	store: ScoreStore,
	results: RoundResult[],
	now: number,
): Map<string, Period> {
	const runs: RunRecord[] = results
		.filter((r): r is RoundResult & { key: string } => r.key !== null && r.score > 0)
		.map((r) => ({ key: r.key, name: r.name, score: r.score, finishedAt: now, room: null }));

	const bestThisRound = new Map<string, number>();
	for (const run of runs) {
		bestThisRound.set(run.key, Math.max(run.score, bestThisRound.get(run.key) ?? 0));
	}
	const previous = new Map(
		[...bestThisRound.keys()].map((key) => [
			key,
			new Map(PERIODS.map((period) => [period, store.bestOf(key, period, now)])),
		]),
	);

	store.record(runs);

	const highlights = new Map<string, Period>();
	for (const [key, score] of bestThisRound) {
		const period = PERIODS.find((p) => {
			const before = previous.get(key)!.get(p)!;
			const rank = store.rankOf(key, p, now);
			return (before === null || score > before) && rank !== null && rank <= BOARD_SIZE;
		});
		if (period) {
			highlights.set(key, period);
		}
	}
	return highlights;
}

/** Boards for one viewer: their rows marked, their own runs and rank. Keys never leave here. */
export function viewFor(
	store: ScoreStore,
	key: string | null,
	now: number,
	highlights: LeaderboardView['highlights'],
): LeaderboardView {
	const board = (period: Period) => ({
		everyone: store
			.top(period, now, BOARD_SIZE)
			.map((row) => ({ name: row.name, score: row.score, self: row.key === key })),
		mine: key
			? store
					.runsOf(key, period, now, BOARD_SIZE)
					.map(({ name, score, finishedAt }) => ({ name, score, finishedAt }))
			: [],
		myRank: key ? store.rankOf(key, period, now) : null,
	});
	return {
		boards: { today: board('today'), month: board('month'), all: board('all') },
		highlights,
	};
}
