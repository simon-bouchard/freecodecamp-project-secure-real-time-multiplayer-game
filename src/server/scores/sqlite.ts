import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { Period } from '../../shared/protocol.js';
import { periodStart } from './periods.js';
import type { BoardRow, RunRecord, ScoreStore } from './store.js';

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS runs (
		id INTEGER PRIMARY KEY,
		player_key TEXT NOT NULL,
		name TEXT NOT NULL,
		score INTEGER NOT NULL,
		finished_at INTEGER NOT NULL,
		room TEXT
	);
	CREATE INDEX IF NOT EXISTS runs_by_time ON runs (finished_at);
	CREATE INDEX IF NOT EXISTS runs_by_player ON runs (player_key, finished_at);
`;

/** Best score per player since a time, the earliest time it was reached, and the latest name. */
const TOP_SQL = `
	WITH period AS (SELECT * FROM runs WHERE finished_at >= :since),
	best AS (SELECT player_key, MAX(score) AS score FROM period GROUP BY player_key),
	reached AS (
		SELECT p.player_key, p.score, MIN(p.finished_at) AS finished_at
		FROM period p JOIN best b ON b.player_key = p.player_key AND b.score = p.score
		GROUP BY p.player_key
	)
	SELECT r.player_key AS key,
		(SELECT name FROM runs n WHERE n.player_key = r.player_key
			ORDER BY n.finished_at DESC, n.id DESC LIMIT 1) AS name,
		r.score AS score, r.finished_at AS finishedAt
	FROM reached r
	ORDER BY r.score DESC, r.finished_at ASC, r.player_key ASC
	LIMIT :limit
`;

/** ScoreStore backed by a SQLite file (or ':memory:') through Node's built-in driver. */
export class SqliteScoreStore implements ScoreStore {
	private readonly db: DatabaseSync;
	private readonly insert: StatementSync;
	private readonly topQuery: StatementSync;
	private readonly runsQuery: StatementSync;
	private readonly bestQuery: StatementSync;

	constructor(file: string) {
		if (file !== ':memory:') {
			mkdirSync(path.dirname(file), { recursive: true });
		}
		this.db = new DatabaseSync(file);
		if (file !== ':memory:') {
			this.db.exec('PRAGMA journal_mode = WAL');
		}
		// Wait briefly instead of failing at once if another process holds the file.
		this.db.exec('PRAGMA busy_timeout = 100');
		this.db.exec(SCHEMA);
		this.insert = this.db.prepare(
			'INSERT INTO runs (player_key, name, score, finished_at, room) VALUES (?, ?, ?, ?, ?)',
		);
		this.topQuery = this.db.prepare(TOP_SQL);
		this.runsQuery = this.db.prepare(`
			SELECT player_key AS key, name, score, finished_at AS finishedAt, room FROM runs
			WHERE player_key = ? AND finished_at >= ?
			ORDER BY score DESC, finished_at ASC, id ASC
			LIMIT ?
		`);
		this.bestQuery = this.db.prepare(
			'SELECT MAX(score) AS best FROM runs WHERE player_key = ? AND finished_at >= ?',
		);
	}

	record(runs: RunRecord[]): void {
		this.db.exec('BEGIN');
		try {
			for (const r of runs) {
				this.insert.run(r.key, r.name, r.score, r.finishedAt, r.room);
			}
			this.db.exec('COMMIT');
		} catch (error) {
			if (this.db.isTransaction) {
				this.db.exec('ROLLBACK');
			}
			throw error;
		}
	}

	top(period: Period, now: number, limit = 10): BoardRow[] {
		const rows = this.topQuery.all({ since: periodStart(period, now), limit });
		return rows.map((r) => ({
			key: String(r.key),
			name: String(r.name),
			score: Number(r.score),
			finishedAt: Number(r.finishedAt),
		}));
	}

	runsOf(key: string, period: Period, now: number, limit = 10): RunRecord[] {
		return this.runsQuery.all(key, periodStart(period, now), limit).map((r) => ({
			key: String(r.key),
			name: String(r.name),
			score: Number(r.score),
			finishedAt: Number(r.finishedAt),
			room: r.room === null ? null : String(r.room),
		}));
	}

	rankOf(key: string, period: Period, now: number): number | null {
		const index = this.top(period, now, -1).findIndex((r) => r.key === key);
		return index === -1 ? null : index + 1;
	}

	bestOf(key: string, period: Period, now: number): number | null {
		const best = this.bestQuery.get(key, periodStart(period, now))?.best;
		return best === null || best === undefined ? null : Number(best);
	}

	close(): void {
		this.db.close();
	}
}
