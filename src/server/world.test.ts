import { expect, test } from 'vitest';
import {
	COIN_RADIUS,
	INPUT_RATE_TOLERANCE,
	MAX_INPUT_CREDITS,
	PLAYER_RADIUS,
} from '../shared/constants.js';
import { NO_INPUT, circlesOverlap } from '../shared/game.js';
import type { InputState } from '../shared/protocol.js';
import { World } from './world.js';

const RIGHT: InputState = { ...NO_INPUT, right: true };

function playerX(world: World, id: string): number {
	const p = world.snapshot(0).players.find((pl) => pl.id === id);
	if (!p) throw new Error(`no player ${id}`);
	return p.x;
}

function worldWithPlayerAt(x: number, y: number): World {
	const world = new World();
	world.addPlayer('a');
	world.setPlayerPosition('a', { x, y });
	world.setCoinPosition({ x: 600, y: 440 });
	return world;
}

test('applies queued input and acks seq', () => {
	const world = worldWithPlayerAt(300, 300);
	world.queueInput('a', { seq: 1, input: RIGHT });
	world.step();
	const p = world.snapshot(0).players[0];
	expect(p?.x).toBe(310);
	expect(p?.lastSeq).toBe(1);
});

test('no input means no movement', () => {
	const world = worldWithPlayerAt(300, 300);
	for (let i = 0; i < 5; i++) world.step();
	expect(playerX(world, 'a')).toBe(300);
});

test('ignores stale or duplicate seq', () => {
	const world = worldWithPlayerAt(300, 300);
	world.queueInput('a', { seq: 2, input: RIGHT });
	world.queueInput('a', { seq: 2, input: RIGHT });
	world.queueInput('a', { seq: 1, input: RIGHT });
	for (let i = 0; i < 3; i++) world.step();
	expect(playerX(world, 'a')).toBe(310);
});

test('flooding does not increase speed', () => {
	const world = worldWithPlayerAt(21, 300);
	let seq = 0;
	for (let i = 0; i < 40; i++) {
		world.queueInput('a', { seq: ++seq, input: RIGHT });
		world.queueInput('a', { seq: ++seq, input: RIGHT });
		world.step();
	}
	const maxInputs = MAX_INPUT_CREDITS + 40 * INPUT_RATE_TOLERANCE;
	expect(playerX(world, 'a')).toBeLessThanOrEqual(21 + maxInputs * 10 + 1e-6);
	expect(playerX(world, 'a')).toBeGreaterThanOrEqual(21 + 40 * 10 - 1e-6);
});

test('queue cap drops the oldest inputs', () => {
	const world = worldWithPlayerAt(300, 300);
	for (let seq = 1; seq <= 40; seq++) world.queueInput('a', { seq, input: NO_INPUT });
	expect(world.pendingInputs('a').map((m) => m.seq)).toEqual([37, 38, 39, 40]);
	for (let i = 0; i < 40; i++) world.step();
	expect(world.snapshot(0).players[0]?.lastSeq).toBe(40);
});

test('jitter burst does not leave a permanent backlog', () => {
	const world = worldWithPlayerAt(300, 300);
	let seq = 0;
	for (let i = 0; i < 6; i++) world.queueInput('a', { seq: ++seq, input: NO_INPUT });
	for (let i = 0; i < 100; i++) {
		world.queueInput('a', { seq: ++seq, input: NO_INPUT });
		world.step();
	}
	expect(world.pendingInputs('a').length).toBeLessThanOrEqual(1);
});

test('only the four direction flags are stored', () => {
	const world = worldWithPlayerAt(300, 300);
	const input = { ...RIGHT, junk: 'x'.repeat(1000) } as InputState;
	world.queueInput('a', { seq: 1, input });
	expect(Object.keys(world.pendingInputs('a')[0]!.input).sort()).toEqual([
		'down',
		'left',
		'right',
		'up',
	]);
});

test('coin collected once when two players overlap it', () => {
	const world = new World();
	world.addPlayer('a');
	world.addPlayer('b');
	world.setCoinPosition({ x: 300, y: 300 });
	world.setPlayerPosition('a', { x: 300, y: 300 });
	world.setPlayerPosition('b', { x: 300, y: 300 });
	world.step();
	const snap = world.snapshot(0);
	const [a, b] = snap.players;
	expect(a?.score).toBe(1);
	expect(b?.score).toBe(0);
	expect(snap.coin.id).toBe(2);
	for (const p of snap.players) {
		expect(circlesOverlap(p, PLAYER_RADIUS, snap.coin, COIN_RADIUS)).toBe(false);
	}
});

test('pickup happens in the same tick as the move', () => {
	const world = worldWithPlayerAt(300, 300);
	world.setCoinPosition({ x: 331, y: 300 });
	world.queueInput('a', { seq: 1, input: RIGHT });
	world.step();
	expect(world.snapshot(0).players[0]?.score).toBe(1);
});

test('removePlayer drops from snapshot', () => {
	const world = worldWithPlayerAt(300, 300);
	world.addPlayer('b');
	world.removePlayer('a');
	expect(world.snapshot(0).players.map((p) => p.id)).toEqual(['b']);
});

test('queueInput for unknown id is ignored', () => {
	const world = new World();
	expect(() => world.queueInput('nobody', { seq: 1, input: RIGHT })).not.toThrow();
	world.step();
	expect(world.snapshot(0).players).toEqual([]);
});

test('new player starts at seq 0', () => {
	const world = worldWithPlayerAt(300, 300);
	world.queueInput('a', { seq: 5, input: RIGHT });
	world.step();
	world.removePlayer('a');
	world.addPlayer('a');
	world.queueInput('a', { seq: 1, input: RIGHT });
	world.step();
	expect(world.snapshot(0).players[0]?.lastSeq).toBe(1);
});

test('snapshot is a copy', () => {
	const world = worldWithPlayerAt(300, 300);
	const snap = world.snapshot(0);
	snap.players[0]!.x = 0;
	snap.coin.x = 0;
	const next = world.snapshot(0);
	expect(next.players[0]?.x).toBe(300);
	expect(next.coin.x).toBe(600);
});

test('snapshot carries time and tick', () => {
	const world = new World();
	world.step();
	world.step();
	expect(world.snapshot(1234)).toMatchObject({ tick: 2, time: 1234 });
});
