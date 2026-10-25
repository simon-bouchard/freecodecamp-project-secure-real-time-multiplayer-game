import type { Period } from '../../shared/protocol.js';

/** One player's final score for one round. */
export interface RunRecord {
	key: string;
	name: string;
	score: number;
	finishedAt: number;
	room: string | null;
}

/** A player's best run in a period, shown under their most recent name. */
export interface BoardRow {
	key: string;
	name: string;
	score: number;
	finishedAt: number;
}

/** Persistence for runs; the only place that talks to the database. */
export interface ScoreStore {
	record(runs: RunRecord[]): void;
	/** Best run per player in the period; ties go to whoever reached the score first. */
	top(period: Period, now: number, limit?: number): BoardRow[];
	/** A player's own runs in the period, best first. */
	runsOf(key: string, period: Period, now: number, limit?: number): RunRecord[];
	/** 1-based position among players in the period, or null without runs there. */
	rankOf(key: string, period: Period, now: number): number | null;
	bestOf(key: string, period: Period, now: number): number | null;
	close(): void;
}
