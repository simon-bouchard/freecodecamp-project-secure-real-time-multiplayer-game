import type { ItemKind } from './constants.js';
import type { MapChoice, MapId } from './maps.js';

export type { ItemKind };

export interface Vec {
	x: number;
	y: number;
}

/** Movement direction; length 0 (stand still) to 1 (full speed). */
export interface Move {
	x: number;
	y: number;
}

/** Which direction keys are currently held (keyboard, and the pre-touch wire format). */
export interface InputState {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

/** One client tick of input; `seq` increases by one per message. `dash` asks to start a dash. */
export interface InputMessage {
	seq: number;
	move: Move;
	dash?: true;
}

/** A dash in progress: inputs it still covers and its fixed direction (unit length). */
export interface DashState {
	left: number;
	dir: Vec;
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
	/** Knockback velocity in px/s from a bump; fades every tick. */
	knock: Vec;
	dash: DashState | null;
	/** Server time (ms) when the next dash is allowed; 0 when ready. */
	dashReadyAt: number;
	/** This player's map vote, or null. */
	vote: MapChoice | null;
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

/** A pickup during the tick a snapshot follows; clients use these for sounds. */
export type GameEvent =
	| { kind: 'coin'; playerId: string }
	| { kind: 'bigCoin'; playerId: string }
	| { kind: 'item'; item: ItemKind; playerId: string }
	| { kind: 'bump'; playerId: string; otherId: string }
	| { kind: 'bumper'; playerId: string };

/** Full game state broadcast once per server tick; `time` is server ms. */
export interface Snapshot {
	tick: number;
	time: number;
	players: PlayerState[];
	coin: CoinState;
	bigCoin: BigCoinState | null;
	items: ItemState[];
	round: RoundState;
	events: GameEvent[];
}

/** `voting` picks the map before the first round; `results` is also the vote for the next one. */
export type RoundPhase = 'waiting' | 'voting' | 'playing' | 'results';

/** Leaderboard time windows: today, this month, all time (server-local calendar). */
export type Period = 'today' | 'month' | 'all';

/** Round status; `endsAt` is the server time the phase ends (null while waiting). */
export interface RoundState {
	phase: RoundPhase;
	endsAt: number | null;
	winners: string[];
	/** The map being played (or last played, during a vote). */
	map: MapId;
	/** Votes for the next map so far. */
	votes: Record<MapChoice, number>;
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
	vote: (choice: MapChoice) => void;
	join: (req: JoinRequest, ack: (res: JoinResult) => void) => void;
}
