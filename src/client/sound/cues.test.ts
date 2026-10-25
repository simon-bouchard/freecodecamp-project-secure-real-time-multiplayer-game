import { expect, test } from 'vitest';
import type { GameEvent, LeaderboardView, RoundPhase, Snapshot } from '../../shared/protocol.js';
import { CueTracker } from './cues.js';

const ROUND_END = 60_000;

function snap(
	time: number,
	{
		phase = 'playing',
		events = [],
		winners = [],
		endsAt = ROUND_END,
	}: { phase?: RoundPhase; events?: GameEvent[]; winners?: string[]; endsAt?: number | null } = {},
): Snapshot {
	const player = (id: string) => ({
		id,
		name: id,
		color: '#fff',
		x: 0,
		y: 0,
		score: 0,
		lastSeq: 0,
		effects: [],
		knock: { x: 0, y: 0 },
		dash: null,
		dashReadyAt: 0,
	});
	return {
		tick: time,
		time,
		players: [player('me'), player('other')],
		coin: { id: 1, x: 0, y: 0 },
		bigCoin: null,
		items: [],
		round: { phase, endsAt, winners },
		events,
	};
}

function board(highlightIds: string[]): LeaderboardView {
	const empty = { everyone: [], mine: [], myRank: null };
	return {
		boards: { today: empty, month: empty, all: empty },
		highlights: highlightIds.map((playerId) => ({ playerId, period: 'today' as const })),
	};
}

/** A tracker that has already seen one mid-round snapshot. */
function midRound(): CueTracker {
	const tracker = new CueTracker();
	tracker.snapshot(snap(10_000), 'me');
	return tracker;
}

test('own pickups map to their cues', () => {
	const tracker = midRound();
	const events: GameEvent[] = [
		{ kind: 'coin', playerId: 'me' },
		{ kind: 'bigCoin', playerId: 'me' },
		{ kind: 'item', item: 'speed', playerId: 'me' },
		{ kind: 'item', item: 'magnet', playerId: 'me' },
		{ kind: 'item', item: 'double', playerId: 'me' },
		{ kind: 'item', item: 'slow', playerId: 'me' },
	];
	expect(tracker.snapshot(snap(10_033, { events }), 'me')).toEqual([
		'coin',
		'ramen',
		'speed',
		'magnet',
		'double',
		'slowGrab',
	]);
});

test("other players' pickups are silent, except a slow that hits you", () => {
	const tracker = midRound();
	const events: GameEvent[] = [
		{ kind: 'coin', playerId: 'other' },
		{ kind: 'item', item: 'speed', playerId: 'other' },
		{ kind: 'item', item: 'slow', playerId: 'other' },
	];
	expect(tracker.snapshot(snap(10_033, { events }), 'me')).toEqual(['slowed']);
});

test('spectators hear no pickups', () => {
	const tracker = new CueTracker();
	tracker.snapshot(snap(10_000), null);
	const events: GameEvent[] = [{ kind: 'item', item: 'slow', playerId: 'other' }];
	expect(tracker.snapshot(snap(10_033, { events }), null)).toEqual([]);
});

test('round start plays when a round begins, not on the first snapshot', () => {
	const tracker = new CueTracker();
	expect(tracker.snapshot(snap(0, { phase: 'results' }), null)).toEqual([]);
	expect(tracker.snapshot(snap(33, { phase: 'playing' }), null)).toEqual(['roundStart']);

	const late = new CueTracker();
	expect(late.snapshot(snap(5_000), null)).toEqual([]);
});

test('countdown ticks once per second for the last five, the last one different', () => {
	const tracker = midRound();
	const cues: string[] = [];
	for (let time = 54_000; time < ROUND_END; time += 100) {
		cues.push(...tracker.snapshot(snap(time), 'me'));
	}
	expect(cues).toEqual(['tick', 'tick', 'tick', 'tick', 'lastTick']);
});

test('joining in the last seconds does not replay earlier ticks', () => {
	const tracker = new CueTracker();
	expect(tracker.snapshot(snap(57_500), null)).toEqual([]);
	expect(tracker.snapshot(snap(57_600), null)).toEqual([]);
	expect(tracker.snapshot(snap(58_100), null)).toEqual(['tick']);
});

test('round end plays win for a winner and round over for everyone else', () => {
	const winner = midRound();
	expect(winner.snapshot(snap(60_000, { phase: 'results', winners: ['me'] }), 'me')).toEqual([
		'win',
	]);
	const loser = midRound();
	expect(loser.snapshot(snap(60_000, { phase: 'results', winners: ['other'] }), 'me')).toEqual([
		'roundOver',
	]);
	const spectator = new CueTracker();
	spectator.snapshot(snap(10_000), null);
	expect(spectator.snapshot(snap(60_000, { phase: 'results', winners: ['other'] }), null)).toEqual([
		'roundOver',
	]);
});

test('personal best follows the round end, whichever arrives first', () => {
	const boardFirst = midRound();
	expect(boardFirst.leaderboard(board(['me']), 'me')).toEqual([]);
	expect(boardFirst.snapshot(snap(60_000, { phase: 'results' }), 'me')).toEqual([
		'roundOver',
		'personalBest',
	]);

	const snapshotFirst = midRound();
	snapshotFirst.snapshot(snap(60_000, { phase: 'results' }), 'me');
	expect(snapshotFirst.leaderboard(board(['me']), 'me')).toEqual(['personalBest']);
	expect(snapshotFirst.leaderboard(board(['me']), 'me')).toEqual([]);
});

test("someone else's best, or a board sent on connect, plays nothing", () => {
	const tracker = midRound();
	tracker.leaderboard(board(['other']), 'me');
	expect(tracker.snapshot(snap(60_000, { phase: 'results' }), 'me')).toEqual(['roundOver']);

	const reconnected = new CueTracker();
	reconnected.snapshot(snap(61_000, { phase: 'results' }), 'me');
	expect(reconnected.leaderboard(board(['me']), 'me')).toEqual([]);
});

test('a best from one round does not carry into the next', () => {
	const tracker = midRound();
	tracker.leaderboard(board(['me']), 'me');
	tracker.snapshot(snap(60_000, { phase: 'results' }), 'me');
	tracker.snapshot(snap(68_000, { phase: 'playing', endsAt: 128_000 }), 'me');
	expect(tracker.snapshot(snap(128_000, { phase: 'results', endsAt: 136_000 }), 'me')).toEqual([
		'roundOver',
	]);
});

test('reset forgets the previous round state', () => {
	const tracker = midRound();
	tracker.reset();
	expect(tracker.snapshot(snap(60_000, { phase: 'results' }), 'me')).toEqual([]);
});

test('a bump plays for both players in it, and only them', () => {
	const tracker = midRound();
	const hit: GameEvent[] = [{ kind: 'bump', playerId: 'me', otherId: 'other' }];
	const hitBy: GameEvent[] = [{ kind: 'bump', playerId: 'other', otherId: 'me' }];
	const elsewhere: GameEvent[] = [{ kind: 'bump', playerId: 'other', otherId: 'third' }];
	expect(tracker.snapshot(snap(10_033, { events: hit }), 'me')).toEqual(['bump']);
	expect(tracker.snapshot(snap(10_300, { events: hitBy }), 'me')).toEqual(['bump']);
	expect(tracker.snapshot(snap(10_600, { events: elsewhere }), 'me')).toEqual([]);
});

test('a chase that bumps every tick plays the bump sound at most every 150 ms', () => {
	const tracker = midRound();
	const events: GameEvent[] = [{ kind: 'bump', playerId: 'me', otherId: 'other' }];
	const cues: string[] = [];
	for (let time = 10_000; time < 10_500; time += 1000 / 30) {
		cues.push(...tracker.snapshot(snap(time, { events }), 'me'));
	}
	expect(cues).toEqual(['bump', 'bump', 'bump']);
});
