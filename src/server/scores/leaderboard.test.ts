import { afterEach, expect, test } from 'vitest';
import type { RoundResult } from '../world.js';
import { recordRound, viewFor } from './leaderboard.js';
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
	expect(recordRound(s, [result('a', 3)], NOW)).toEqual(new Map([['a', 'all']]));
});

test('beating only your best of today gives a today highlight', () => {
	const s = store();
	s.record([{ key: 'a', name: 'a', score: 10, finishedAt: EARLIER_THIS_MONTH, room: null }]);
	recordRound(s, [result('a', 5)], NOW - 60_000);
	expect(recordRound(s, [result('a', 7)], NOW)).toEqual(new Map([['a', 'today']]));
});

test('equalling your best is not a new best', () => {
	const s = store();
	recordRound(s, [result('a', 5)], NOW - 60_000);
	expect(recordRound(s, [result('a', 5)], NOW).size).toBe(0);
});

test('no highlight when the run does not reach the top 10', () => {
	const s = store();
	recordRound(
		s,
		Array.from({ length: 10 }, (_, i) => result(`p${i}`, 20 + i)),
		NOW - 60_000,
	);
	expect(recordRound(s, [result('a', 1)], NOW).size).toBe(0);
});

test('two tabs of one browser in the same round count as one player', () => {
	const s = store();
	const highlights = recordRound(s, [result('a', 3, 'tab1'), result('a', 6, 'tab2')], NOW);
	expect(s.top('all', NOW)).toEqual([expect.objectContaining({ key: 'a', score: 6 })]);
	expect(highlights).toEqual(new Map([['a', 'all']]));
});

test('a view marks your rows, lists only your runs and never exposes keys', () => {
	const s = store();
	recordRound(s, [result('a', 3, 'p1', 'Ann'), result('b', 5, 'p2', 'Bob')], NOW);
	const view = viewFor(s, 'a', NOW, [{ playerId: 'p1', period: 'all' }]);
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
	const view = viewFor(s, null, NOW, []);
	expect(view.boards.all.everyone).toHaveLength(1);
	expect(view.boards.all.mine).toEqual([]);
	expect(view.boards.all.myRank).toBeNull();
});
