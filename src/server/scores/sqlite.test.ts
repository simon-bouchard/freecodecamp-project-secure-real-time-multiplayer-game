import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { SqliteScoreStore } from './sqlite.js';
import type { RunRecord } from './store.js';

const NOW = Date.parse('2026-10-25T15:00:00Z');
const YESTERDAY_LATE = Date.parse('2026-10-24T23:59:59Z');
const EARLY_TODAY = Date.parse('2026-10-25T00:00:00Z');
const LAST_MONTH = Date.parse('2026-09-30T12:00:00Z');

const stores: SqliteScoreStore[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));

function store(file = ':memory:'): SqliteScoreStore {
	const s = new SqliteScoreStore(file);
	stores.push(s);
	return s;
}

function run(key: string, score: number, finishedAt: number, name = key): RunRecord {
	return { key, name, score, finishedAt, room: null };
}

test('top lists one row per player with their best score and latest name', () => {
	const s = store();
	s.record([run('a', 3, EARLY_TODAY, 'Ann'), run('b', 5, EARLY_TODAY, 'Bob')]);
	s.record([run('a', 7, EARLY_TODAY + 1000, 'Annie'), run('a', 2, EARLY_TODAY + 2000, 'Ann2')]);
	expect(s.top('all', NOW)).toEqual([
		{ key: 'a', name: 'Ann2', score: 7, finishedAt: EARLY_TODAY + 1000 },
		{ key: 'b', name: 'Bob', score: 5, finishedAt: EARLY_TODAY },
	]);
});

test('ties go to whoever reached the score first', () => {
	const s = store();
	s.record([run('late', 4, EARLY_TODAY + 5000), run('early', 4, EARLY_TODAY + 1000)]);
	expect(s.top('all', NOW).map((r) => r.key)).toEqual(['early', 'late']);
});

test('a player who equals their best later keeps the earlier time', () => {
	const s = store();
	s.record([run('a', 4, EARLY_TODAY + 1000), run('b', 4, EARLY_TODAY + 2000)]);
	s.record([run('a', 4, EARLY_TODAY + 9000)]);
	expect(s.top('all', NOW)[0]).toMatchObject({ key: 'a', finishedAt: EARLY_TODAY + 1000 });
});

test('periods filter by calendar day and month', () => {
	const s = store();
	s.record([run('y', 9, YESTERDAY_LATE), run('t', 2, EARLY_TODAY), run('m', 8, LAST_MONTH)]);
	expect(s.top('today', NOW).map((r) => r.key)).toEqual(['t']);
	expect(s.top('month', NOW).map((r) => r.key)).toEqual(['y', 't']);
	expect(s.top('all', NOW).map((r) => r.key)).toEqual(['y', 'm', 't']);
});

test('top is limited to 10 by default', () => {
	const s = store();
	s.record(Array.from({ length: 15 }, (_, i) => run(`p${i}`, i + 1, EARLY_TODAY)));
	const top = s.top('all', NOW);
	expect(top).toHaveLength(10);
	expect(top[0]!.score).toBe(15);
});

test('runsOf lists a player own runs, best first, then oldest first', () => {
	const s = store();
	s.record([run('a', 3, EARLY_TODAY + 3000, 'Ann'), run('b', 9, EARLY_TODAY)]);
	s.record([run('a', 5, EARLY_TODAY + 2000, 'Annie'), run('a', 3, EARLY_TODAY + 1000)]);
	s.record([run('a', 6, YESTERDAY_LATE)]);
	expect(s.runsOf('a', 'today', NOW)).toEqual([
		run('a', 5, EARLY_TODAY + 2000, 'Annie'),
		run('a', 3, EARLY_TODAY + 1000),
		run('a', 3, EARLY_TODAY + 3000, 'Ann'),
	]);
	expect(s.runsOf('a', 'all', NOW)[0]!.score).toBe(6);
	expect(s.runsOf('nobody', 'all', NOW)).toEqual([]);
});

test('rankOf and bestOf', () => {
	const s = store();
	s.record([run('a', 3, EARLY_TODAY), run('b', 5, EARLY_TODAY), run('c', 4, YESTERDAY_LATE)]);
	expect(s.rankOf('b', 'all', NOW)).toBe(1);
	expect(s.rankOf('a', 'all', NOW)).toBe(3);
	expect(s.rankOf('c', 'today', NOW)).toBeNull();
	expect(s.bestOf('c', 'all', NOW)).toBe(4);
	expect(s.bestOf('c', 'today', NOW)).toBeNull();
});

test('data survives reopening a database file', () => {
	const file = path.join(mkdtempSync(path.join(tmpdir(), 'coin-race-db-')), 'nested', 'scores.db');
	const first = new SqliteScoreStore(file);
	first.record([run('a', 3, EARLY_TODAY)]);
	first.close();
	expect(store(file).top('all', NOW)).toHaveLength(1);
});
