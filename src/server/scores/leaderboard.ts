import type { LeaderboardView, Period } from '../../shared/protocol.js';
import type { RoundResult } from '../world.js';
import type { BoardRow, RunRecord, ScoreStore } from './store.js';

/** Strongest first: an all-time record beats a monthly best, which beats a daily best. */
const PERIODS: readonly Period[] = ['all', 'month', 'today'];
const BOARD_SIZE = 10;

/** Every player ranked for each period; computed once and shared by all viewers. */
export type RankedBoards = Record<Period, BoardRow[]>;

/** Rank all players for every period (one query per period). */
export function rankedBoards(store: ScoreStore, now: number): RankedBoards {
	return {
		today: store.top('today', now, -1),
		month: store.top('month', now, -1),
		all: store.top('all', now, -1),
	};
}

/**
 * Save a finished round's results. Returns the fresh ranked boards and, per player key, the
 * strongest period in which the run is a new personal best that also reaches the top 10.
 */
export function recordRound(
	store: ScoreStore,
	results: RoundResult[],
	now: number,
): { boards: RankedBoards; highlights: Map<string, Period> } {
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
	const boards = rankedBoards(store, now);

	const highlights = new Map<string, Period>();
	for (const [key, score] of bestThisRound) {
		const period = PERIODS.find((p) => {
			const before = previous.get(key)!.get(p)!;
			const index = boards[p].findIndex((row) => row.key === key);
			return (before === null || score > before) && index !== -1 && index < BOARD_SIZE;
		});
		if (period) {
			highlights.set(key, period);
		}
	}
	return { boards, highlights };
}

/**
 * Boards for one viewer from the shared ranking: their rows marked, their rank, and their own
 * runs (one indexed query per period). Keys never leave here.
 */
export function viewFor(
	store: ScoreStore,
	boards: RankedBoards,
	key: string | null,
	now: number,
	highlights: LeaderboardView['highlights'],
): LeaderboardView {
	const board = (period: Period) => {
		const ranked = boards[period];
		const index = key ? ranked.findIndex((row) => row.key === key) : -1;
		return {
			everyone: ranked
				.slice(0, BOARD_SIZE)
				.map((row) => ({ name: row.name, score: row.score, self: row.key === key })),
			mine: key
				? store
						.runsOf(key, period, now, BOARD_SIZE)
						.map(({ name, score, finishedAt }) => ({ name, score, finishedAt }))
				: [],
			myRank: index === -1 ? null : index + 1,
		};
	};
	return {
		boards: { today: board('today'), month: board('month'), all: board('all') },
		highlights,
	};
}
