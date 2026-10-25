import { expect, test } from 'vitest';
import { SNAPSHOT_BUFFER_MS } from '../shared/constants.js';
import type { PlayerState, Snapshot } from '../shared/protocol.js';
import { SnapshotBuffer } from './interpolation.js';

function player(id: string, x: number): PlayerState {
	return { id, name: id, color: '#ff4d4d', x, y: 200, score: 0, lastSeq: 0, effects: [] };
}

function snap(time: number, players: PlayerState[]): Snapshot {
	return {
		tick: time,
		time,
		players,
		coin: { id: 1, x: 50, y: 50 },
		bigCoin: null,
		item: null,
		round: { phase: 'playing', endsAt: null, winners: [] },
	};
}

function twoSnapshots(first: PlayerState[], second: PlayerState[]): SnapshotBuffer {
	const buffer = new SnapshotBuffer();
	buffer.push(snap(1000, first), 1000);
	buffer.push(snap(1100, second), 1100);
	return buffer;
}

test('midpoint between two snapshots', () => {
	const buffer = twoSnapshots([player('a', 0)], [player('a', 100)]);
	expect(buffer.sample(1050).get('a')).toEqual({ x: 50, y: 200 });
});

test('clamps beyond newest and before oldest', () => {
	const buffer = twoSnapshots([player('a', 0)], [player('a', 100)]);
	expect(buffer.sample(2000).get('a')?.x).toBe(100);
	expect(buffer.sample(0).get('a')?.x).toBe(0);
});

test('player joining appears at its position', () => {
	const buffer = twoSnapshots([player('a', 0)], [player('a', 100), player('b', 300)]);
	expect(buffer.sample(1050).get('b')).toEqual({ x: 300, y: 200 });
});

test('player leaving disappears', () => {
	const buffer = twoSnapshots([player('a', 0), player('b', 300)], [player('b', 300)]);
	expect(buffer.sample(1050).has('a')).toBe(false);
});

test('prunes old snapshots', () => {
	const buffer = new SnapshotBuffer();
	for (let i = 0; i < 100; i++) buffer.push(snap(i * 33, [player('a', i)]), i * 33);
	expect(buffer.size).toBeLessThanOrEqual(Math.ceil(SNAPSHOT_BUFFER_MS / 33) + 2);
	expect(buffer.latest()?.time).toBe(99 * 33);
});

test('serverTimeAt with zero offset', () => {
	const buffer = twoSnapshots([player('a', 0)], [player('a', 100)]);
	expect(Math.abs(buffer.serverTimeAt(1500) - 1500)).toBeLessThanOrEqual(1);
});

test('clear empties the buffer', () => {
	const buffer = twoSnapshots([player('a', 0)], [player('a', 100)]);
	buffer.clear();
	expect(buffer.latest()).toBeUndefined();
	expect(buffer.sample(1050).size).toBe(0);
});
