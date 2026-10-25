import { afterEach, expect, test } from 'vitest';
import type { RoundResult } from '../world.js';
import { rankedBoards, recordRound, viewFor } from './leaderboard.js';
import { SqliteScoreStore } from './sqlite.js';

const NOW = Date.parse('2026-10-25T15:00:00Z');
const EARLIER_THIS_MONTH = Date.parse('2026-10-03T12:00:00Z');

const stores: SqliteScoreStore[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));

function store(): SqliteScoreStore {
	const s = new SqliteScoreStore(':memory:');
	stores.push(s);
	return s;
}

function result(key: string | null, score: number, id = key ?? 'anon', name = id): RoundResult {
	return { id, key, name, score };
}

test('zero scores and players without a key are not recorded', () => {
	const s = store();
	recordRound(s, [result('a', 0), result(null, 5), result('b', 2)], NOW);
	expect(s.top('all', NOW).map((r) => r.key)).toEqual(['b']);
});

test('a first run on an empty board is an all-time record', () => {
	const s = store();
	expect(recordRound(s, [result('a', 3)], NOW).highlights).toEqual(new Map([['a', 'all']]));
});

test('beating only your best of today gives a today highlight', () => {
	const s = store();
	s.record([{ key: 'a', name: 'a', score: 10, finishedAt: EARLIER_THIS_MONTH, room: null }]);
	recordRound(s, [result('a', 5)], NOW - 60_000);
	expect(recordRound(s, [result('a', 7)], NOW).highlights).toEqual(new Map([['a', 'today']]));
});

test('equalling your best is not a new best', () => {
	const s = store();
	recordRound(s, [result('a', 5)], NOW - 60_000);
	expect(recordRound(s, [result('a', 5)], NOW).highlights.size).toBe(0);
});

test('no highlight when the run does not reach the top 10', () => {
	const s = store();
	recordRound(
		s,
		Array.from({ length: 10 }, (_, i) => result(`p${i}`, 20 + i)),
		NOW - 60_000,
	);
	expect(recordRound(s, [result('a', 1)], NOW).highlights.size).toBe(0);
});

test('two tabs of one browser in the same round count as one player', () => {
	const s = store();
	const { highlights } = recordRound(s, [result('a', 3, 'tab1'), result('a', 6, 'tab2')], NOW);
	expect(s.top('all', NOW)).toEqual([expect.objectContaining({ key: 'a', score: 6 })]);
	expect(highlights).toEqual(new Map([['a', 'all']]));
});

test('a view marks your rows, lists only your runs and never exposes keys', () => {
	const s = store();
	recordRound(s, [result('a', 3, 'p1', 'Ann'), result('b', 5, 'p2', 'Bob')], NOW);
	const view = viewFor(s, rankedBoards(s, NOW), 'a', NOW, [{ playerId: 'p1', period: 'all' }]);
	expect(view.boards.today.everyone).toEqual([
		{ name: 'Bob', score: 5, self: false },
		{ name: 'Ann', score: 3, self: true },
	]);
	expect(view.boards.all.mine).toEqual([{ name: 'Ann', score: 3, finishedAt: NOW }]);
	expect(view.boards.month.myRank).toBe(2);
	expect(view.highlights).toEqual([{ playerId: 'p1', period: 'all' }]);
	expect(JSON.stringify(view)).not.toMatch(/"a"|"b"/);
});

test('a keyless viewer sees the boards but no personal data', () => {
	const s = store();
	recordRound(s, [result('a', 3)], NOW);
	const view = viewFor(s, rankedBoards(s, NOW), null, NOW, []);
	expect(view.boards.all.everyone).toHaveLength(1);
	expect(view.boards.all.mine).toEqual([]);
	expect(view.boards.all.myRank).toBeNull();
});

test('a round end with many viewers ranks each board only once', () => {
	const s = store();
	let topCalls = 0;
	const top = s.top.bind(s);
	s.top = (...args) => {
		topCalls++;
		return top(...args);
	};
	const players = Array.from({ length: 12 }, (_, i) => result(`k${i}`, i + 1, `p${i}`));
	const { boards, highlights } = recordRound(s, players, NOW);
	for (const p of players) {
		viewFor(
			s,
			boards,
			p.key,
			NOW,
			[...highlights].map(([, period]) => ({ playerId: 'x', period })),
		);
	}
	expect(topCalls).toBe(3);
});

test('ranks and top 10 come from the shared ranked boards', () => {
	const s = store();
	recordRound(
		s,
		Array.from({ length: 12 }, (_, i) => result(`k${i}`, 100 - i, `p${i}`)),
		NOW,
	);
	const view = viewFor(s, rankedBoards(s, NOW), 'k11', NOW, []);
	expect(view.boards.all.everyone).toHaveLength(10);
	expect(view.boards.all.everyone.some((r) => r.self)).toBe(false);
	expect(view.boards.all.myRank).toBe(12);
});
