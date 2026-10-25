import type { ItemKind } from './constants.js';

export type { ItemKind };

export interface Vec {
	x: number;
	y: number;
}

/** Which direction keys are currently held. */
export interface InputState {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

/** One client tick of input; `seq` increases by one per message. */
export interface InputMessage {
	seq: number;
	input: InputState;
}

/** A player as the server sees it; `lastSeq` is the last input applied. */
export interface PlayerState {
	id: string;
	name: string;
	color: string;
	x: number;
	y: number;
	score: number;
	lastSeq: number;
	effects: EffectState[];
}

/** An active boost on a player; `endsAt` is server time in ms. */
export interface EffectState {
	kind: ItemKind;
	endsAt: number;
}

/** The rare high-value coin; `expiresAt` is server time in ms. */
export interface BigCoinState {
	id: number;
	x: number;
	y: number;
	expiresAt: number;
}

/** A boost waiting to be picked up; `expiresAt` is server time in ms. */
export interface ItemState {
	id: number;
	kind: ItemKind;
	x: number;
	y: number;
	expiresAt: number;
}

export interface CoinState {
	id: number;
	x: number;
	y: number;
}

/** Full game state broadcast once per server tick; `time` is server ms. */
export interface Snapshot {
	tick: number;
	time: number;
	players: PlayerState[];
	coin: CoinState;
	bigCoin: BigCoinState | null;
	item: ItemState | null;
	round: RoundState;
}

export type RoundPhase = 'waiting' | 'playing' | 'results';

/** Leaderboard time windows: today, this month, all time (server-local calendar). */
export type Period = 'today' | 'month' | 'all';

/** Round status; `endsAt` is the server time the phase ends (null while waiting). */
export interface RoundState {
	phase: RoundPhase;
	endsAt: number | null;
	winners: string[];
}

/** Join or rejoin; `token` from an earlier join takes that player back after a reconnect. */
export interface JoinRequest {
	name: string;
	color: string;
	token?: string;
}

/** Why a join failed; `timeout` is produced by the client when the server never answers. */
export type JoinFailure = 'invalid' | 'unknown-color' | 'color-taken' | 'full' | 'timeout';

export type JoinResult = { ok: true; token: string } | { ok: false; reason: JoinFailure };

/** One row of an "Everyone" board; `self` marks the viewer's own entry. */
export interface LeaderboardRow {
	name: string;
	score: number;
	self: boolean;
}

/** One of the viewer's own runs. */
export interface MyRun {
	name: string;
	score: number;
	finishedAt: number;
}

export interface PeriodBoard {
	everyone: LeaderboardRow[];
	mine: MyRun[];
	myRank: number | null;
}

/** Leaderboards as seen by one client, plus who just set a new best (by in-game id). */
export interface LeaderboardView {
	boards: Record<Period, PeriodBoard>;
	highlights: { playerId: string; period: Period }[];
}

export interface ServerToClientEvents {
	snapshot: (snapshot: Snapshot) => void;
	leaderboard: (view: LeaderboardView) => void;
}

export interface ClientToServerEvents {
	input: (msg: InputMessage) => void;
	join: (req: JoinRequest, ack: (res: JoinResult) => void) => void;
}
