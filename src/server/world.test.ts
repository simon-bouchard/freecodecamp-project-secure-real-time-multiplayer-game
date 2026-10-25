import { expect, test } from 'vitest';
import {
	BIG_COIN_DELAY_TICKS,
	BIG_COIN_LIFETIME_TICKS,
	BIG_COIN_RADIUS,
	COIN_RADIUS,
	EFFECT_TICKS,
	INPUT_RATE_TOLERANCE,
	ITEM_DELAY_TICKS,
	ITEM_KINDS,
	ITEM_LIFETIME_TICKS,
	MAX_INPUT_CREDITS,
	MAX_PLAYERS,
	PALETTE,
	PLAYER_RADIUS,
	RESULTS_TICKS,
	ROUND_TICKS,
	TICK_MS,
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

function tokens(): () => string {
	let n = 0;
	return () => `t${++n}`;
}

function color(i: number): string {
	return PALETTE[i]!;
}

function steps(world: World, n: number): void {
	for (let i = 0; i < n; i++) world.step();
}

test('join assigns a token and the chosen colour', () => {
	const world = new World(Math.random, tokens());
	expect(world.join('a', { name: ' Ann ', color: color(3) })).toEqual({ ok: true, token: 't1' });
	const snap = world.snapshot(0);
	expect(snap.players[0]).toMatchObject({ id: 'a', name: 'Ann', color: color(3), score: 0 });
	expect(JSON.stringify(snap)).not.toContain('t1');
});

test('join rejects a taken colour', () => {
	const world = new World();
	world.join('a', { name: 'Ann', color: color(0) });
	expect(world.join('b', { name: 'Bob', color: color(0) })).toEqual({
		ok: false,
		reason: 'color-taken',
	});
});

test('join rejects when the game is full', () => {
	const world = new World();
	for (let i = 0; i < MAX_PLAYERS; i++) world.join(`p${i}`, { name: 'p', color: color(i) });
	expect(world.join('late', { name: 'Late', color: color(0) })).toEqual({
		ok: false,
		reason: 'full',
	});
});

test('join rejects a second join on the same id', () => {
	const world = new World();
	world.join('a', { name: 'Ann', color: color(0) });
	expect(world.join('a', { name: 'Ann', color: color(1) })).toEqual({
		ok: false,
		reason: 'invalid',
	});
});

test('join rejects a blank name', () => {
	const world = new World();
	expect(world.join('a', { name: '   ', color: color(0) })).toEqual({
		ok: false,
		reason: 'invalid',
	});
});

test('token hands the player over', () => {
	const world = new World(Math.random, tokens());
	world.join('a', { name: 'Ann', color: color(2) });
	world.setScore('a', 4);
	world.setPlayerPosition('a', { x: 100, y: 100 });
	world.setCoinPosition({ x: 600, y: 440 });
	world.queueInput('a', { seq: 7, input: RIGHT });
	expect(world.join('b', { name: 'x', color: color(5), token: 't1' })).toEqual({
		ok: true,
		token: 't1',
	});
	const players = world.snapshot(0).players;
	expect(players).toHaveLength(1);
	expect(players[0]).toMatchObject({
		id: 'b',
		name: 'Ann',
		color: color(2),
		score: 4,
		x: 100,
		y: 100,
		lastSeq: 0,
	});
	expect(world.pendingInputs('b')).toEqual([]);
	world.queueInput('b', { seq: 1, input: RIGHT });
	expect(world.pendingInputs('b')).toHaveLength(1);
	world.removePlayer('a');
	expect(world.snapshot(0).players.map((p) => p.id)).toEqual(['b']);
});

test('unknown token is a normal join', () => {
	const world = new World(Math.random, tokens());
	expect(world.join('a', { name: 'Ann', color: color(0), token: 'nope' })).toEqual({
		ok: true,
		token: 't1',
	});
});

test('round ends after ROUND_TICKS', () => {
	const world = new World();
	world.join('a', { name: 'Ann', color: color(0) });
	expect(world.phase).toBe('playing');
	steps(world, ROUND_TICKS - 1);
	expect(world.phase).toBe('playing');
	world.step();
	expect(world.phase).toBe('results');
});

test('winners are all top scorers', () => {
	const world = new World();
	world.addPlayer('a');
	world.addPlayer('b');
	world.addPlayer('c');
	world.setCoinPosition({ x: 600, y: 440 });
	['a', 'b', 'c'].forEach((id) => world.setPlayerPosition(id, { x: 100, y: 100 }));
	world.setScore('a', 3);
	world.setScore('b', 3);
	world.setScore('c', 1);
	steps(world, ROUND_TICKS);
	expect(world.snapshot(0).round.winners).toEqual(['a', 'b']);
});

test('no movement or pickups during results', () => {
	const world = worldWithPlayerAt(300, 300);
	steps(world, ROUND_TICKS);
	world.setCoinPosition({ x: 300, y: 300 });
	world.queueInput('a', { seq: 1, input: RIGHT });
	world.step();
	const p = world.snapshot(0).players[0];
	expect(p).toMatchObject({ x: 300, y: 300, score: 0, lastSeq: 1 });
});

test('next round resets scores and coin', () => {
	const world = worldWithPlayerAt(300, 300);
	world.setScore('a', 5);
	steps(world, ROUND_TICKS);
	const coinId = world.snapshot(0).coin.id;
	steps(world, RESULTS_TICKS);
	const snap = world.snapshot(0);
	expect(world.phase).toBe('playing');
	expect(snap.players[0]?.score).toBe(0);
	expect(snap.coin.id).toBe(coinId + 1);
	expect(snap.round.winners).toEqual([]);
});

test('joining during results starts at 0 and cannot move', () => {
	const world = worldWithPlayerAt(300, 300);
	world.setScore('a', 2);
	steps(world, ROUND_TICKS);
	world.join('b', { name: 'Bob', color: color(7) });
	world.setPlayerPosition('b', { x: 200, y: 200 });
	world.queueInput('b', { seq: 1, input: RIGHT });
	world.step();
	expect(world.phase).toBe('results');
	expect(world.snapshot(0).players.find((p) => p.id === 'b')).toMatchObject({
		x: 200,
		score: 0,
	});
});

test('endsAt counts down', () => {
	const world = new World();
	world.join('a', { name: 'Ann', color: color(0) });
	expect(world.snapshot(1000).round.endsAt).toBeCloseTo(1000 + ROUND_TICKS * TICK_MS);
	world.step();
	expect(world.snapshot(1000).round.endsAt).toBeCloseTo(1000 + (ROUND_TICKS - 1) * TICK_MS);
});

test('empty game waits and the next join gets a fresh round', () => {
	const world = new World();
	world.join('a', { name: 'Ann', color: color(0) });
	steps(world, 100);
	world.removePlayer('a');
	world.step();
	expect(world.phase).toBe('waiting');
	expect(world.snapshot(0).round.endsAt).toBeNull();
	world.join('b', { name: 'Bob', color: color(1) });
	expect(world.snapshot(0).round.endsAt).toBeCloseTo(ROUND_TICKS * TICK_MS);
});

test('a new player never spawns on the coin', () => {
	const sequence = [0.5, 0.5, 0.5, 0.5, 0.1, 0.1];
	let i = 0;
	const world = new World(() => sequence[i++] ?? 0.9);
	world.addPlayer('a');
	const snap = world.snapshot(0);
	expect(circlesOverlap(snap.players[0]!, PLAYER_RADIUS, snap.coin, COIN_RADIUS)).toBe(false);
});

test('join reports a colour outside the palette as unknown-color', () => {
	const world = new World();
	expect(world.join('a', { name: 'Ann', color: '#f15bb5' })).toEqual({
		ok: false,
		reason: 'unknown-color',
	});
});

function bigCoinWorld(): World {
	const world = new World(() => 0);
	world.addPlayer('a');
	world.setPlayerPosition('a', { x: 300, y: 300 });
	world.setCoinPosition({ x: 600, y: 440 });
	return world;
}

test('big coin spawns when its timer runs out and then expires', () => {
	const world = bigCoinWorld();
	expect(world.bigCoinTimer).toBe(BIG_COIN_DELAY_TICKS[0]);
	steps(world, BIG_COIN_DELAY_TICKS[0] - 1);
	expect(world.snapshot(0).bigCoin).toBeNull();
	world.step();
	const big = world.snapshot(1000).bigCoin;
	expect(big).not.toBeNull();
	expect(big!.expiresAt).toBeCloseTo(1000 + BIG_COIN_LIFETIME_TICKS * TICK_MS);
	steps(world, BIG_COIN_LIFETIME_TICKS - 1);
	expect(world.snapshot(0).bigCoin).not.toBeNull();
	world.step();
	expect(world.snapshot(0).bigCoin).toBeNull();
	expect(world.bigCoinTimer).toBe(BIG_COIN_DELAY_TICKS[0]);
});

test('big coin is worth 5 and restarts the timer when collected', () => {
	const world = bigCoinWorld();
	steps(world, 10);
	world.setBigCoin({ x: 300, y: 300 });
	world.step();
	const snap = world.snapshot(0);
	expect(snap.players[0]?.score).toBe(5);
	expect(snap.bigCoin).toBeNull();
	expect(world.bigCoinTimer).toBe(BIG_COIN_DELAY_TICKS[0]);
});

test('big coin is cleared at round end and when the game empties', () => {
	const world = bigCoinWorld();
	world.setBigCoin({ x: 100, y: 400 });
	steps(world, ROUND_TICKS);
	expect(world.phase).toBe('results');
	expect(world.snapshot(0).bigCoin).toBeNull();

	const empty = bigCoinWorld();
	empty.setBigCoin({ x: 100, y: 400 });
	empty.removePlayer('a');
	empty.step();
	expect(empty.snapshot(0).bigCoin).toBeNull();
});

test('snapshots carry empty effects and no item yet', () => {
	const snap = bigCoinWorld().snapshot(0);
	expect(snap.players[0]?.effects).toEqual([]);
	expect(snap.item).toBeNull();
});

function boostWorld(): World {
	const world = bigCoinWorld();
	world.addPlayer('b');
	world.setPlayerPosition('b', { x: 300, y: 400 });
	return world;
}

function moveRight(world: World, id: string, seq: number): number {
	const before = playerX(world, id);
	world.queueInput(id, { seq, input: RIGHT });
	world.step();
	return playerX(world, id) - before;
}

test('boost item spawns on its timer and expires', () => {
	const world = bigCoinWorld();
	steps(world, ITEM_DELAY_TICKS[0] - 1);
	expect(world.snapshot(0).item).toBeNull();
	world.step();
	const item = world.snapshot(1000).item;
	expect(item?.kind).toBe(ITEM_KINDS[0]);
	expect(item!.expiresAt).toBeCloseTo(1000 + ITEM_LIFETIME_TICKS * TICK_MS);
	steps(world, ITEM_LIFETIME_TICKS);
	expect(world.snapshot(0).item).toBeNull();
});

test('speed pickup gives the collector a full speed effect', () => {
	const world = boostWorld();
	world.setItem('speed', { x: 300, y: 300 });
	world.step();
	expect(world.snapshot(0).item).toBeNull();
	expect(world.effectsOf('a').get('speed')).toBe(EFFECT_TICKS.speed);
	expect(world.effectsOf('b').size).toBe(0);
	expect(moveRight(world, 'a', 1)).toBeCloseTo(15);
});

test('an effect with 2 ticks left boosts exactly the next 2 inputs', () => {
	const world = boostWorld();
	world.setEffect('a', 'speed', 2);
	expect(moveRight(world, 'a', 1)).toBeCloseTo(15);
	expect(moveRight(world, 'a', 2)).toBeCloseTo(15);
	expect(moveRight(world, 'a', 3)).toBeCloseTo(10);
	expect(world.effectsOf('a').size).toBe(0);
});

test('slow pickup slows everyone except the collector', () => {
	const world = boostWorld();
	world.setItem('slow', { x: 300, y: 300 });
	world.step();
	expect(world.effectsOf('a').size).toBe(0);
	expect(world.effectsOf('b').get('slow')).toBe(EFFECT_TICKS.slow);
	expect(moveRight(world, 'b', 1)).toBeCloseTo(5);
});

test('speed and slow stack', () => {
	const world = boostWorld();
	world.setEffect('a', 'speed', 10);
	world.setEffect('a', 'slow', 10);
	expect(moveRight(world, 'a', 1)).toBeCloseTo(7.5);
});

test('picking up an active boost restarts its timer', () => {
	const world = boostWorld();
	world.setEffect('a', 'speed', 10);
	world.setItem('speed', { x: 300, y: 300 });
	world.step();
	expect(world.effectsOf('a').get('speed')).toBe(EFFECT_TICKS.speed);
});

test('double points doubles normal and big coins', () => {
	const world = boostWorld();
	world.setEffect('a', 'double', 100);
	world.setCoinPosition({ x: 300, y: 300 });
	world.step();
	expect(world.snapshot(0).players.find((p) => p.id === 'a')?.score).toBe(2);
	world.setBigCoin({ x: 300, y: 300 });
	world.step();
	expect(world.snapshot(0).players.find((p) => p.id === 'a')?.score).toBe(12);
});

test('magnet pulls coins in range and they get collected', () => {
	const world = boostWorld();
	world.setEffect('a', 'magnet', 100);
	world.setCoinPosition({ x: 400, y: 300 });
	world.step();
	expect(world.snapshot(0).coin.x).toBeCloseTo(390);
	steps(world, 10);
	expect(world.snapshot(0).players.find((p) => p.id === 'a')?.score).toBe(1);
});

test('magnet ignores coins out of range', () => {
	const world = boostWorld();
	world.setEffect('a', 'magnet', 100);
	world.setCoinPosition({ x: 430, y: 300 });
	world.step();
	expect(world.snapshot(0).coin.x).toBe(430);
});

test('magnet also pulls the big coin', () => {
	const world = boostWorld();
	world.setEffect('a', 'magnet', 100);
	world.setBigCoin({ x: 300, y: 200 });
	world.step();
	expect(world.snapshot(0).bigCoin?.y).toBeCloseTo(210);
});

test('with two magnets the coin goes to the nearer player', () => {
	const world = boostWorld();
	world.setPlayerPosition('a', { x: 200, y: 300 });
	world.setPlayerPosition('b', { x: 400, y: 300 });
	world.setEffect('a', 'magnet', 100);
	world.setEffect('b', 'magnet', 100);
	world.setCoinPosition({ x: 290, y: 300 });
	world.step();
	expect(world.snapshot(0).coin.x).toBeCloseTo(280);
});

test('round end clears items and effects; the next round starts clean', () => {
	const world = boostWorld();
	world.setItem('magnet', { x: 100, y: 400 });
	world.setEffect('a', 'speed', 1000);
	world.setEffect('b', 'slow', 1000);
	steps(world, ROUND_TICKS);
	expect(world.phase).toBe('results');
	expect(world.snapshot(0).item).toBeNull();
	expect(world.effectsOf('a').size).toBe(0);
	expect(world.effectsOf('b').size).toBe(0);
	steps(world, RESULTS_TICKS);
	expect(world.phase).toBe('playing');
	expect(world.snapshot(0).item).toBeNull();
});

test('snapshots list effects with their end time', () => {
	const world = boostWorld();
	world.setEffect('a', 'double', 30);
	const a = world.snapshot(1000).players.find((p) => p.id === 'a');
	expect(a?.effects).toEqual([{ kind: 'double', endsAt: 1000 + 30 * TICK_MS }]);
});

/** World whose rng returns queued values first, then a fixed default. */
function scriptedWorld(): { world: World; queue: number[] } {
	const queue: number[] = [];
	const world = new World(() => queue.shift() ?? 0.1);
	return { world, queue };
}

test('a respawned coin never lands on the big coin', () => {
	const { world, queue } = scriptedWorld();
	world.addPlayer('a');
	world.setPlayerPosition('a', { x: 100, y: 400 });
	world.setBigCoin({ x: 320, y: 262.5 });
	world.setCoinPosition({ x: 100, y: 400 });
	queue.push(0.5, 0.5);
	world.step();
	const snap = world.snapshot(0);
	expect(snap.players[0]?.score).toBe(1);
	expect(circlesOverlap(snap.coin, COIN_RADIUS, snap.bigCoin!, BIG_COIN_RADIUS)).toBe(false);
});

test('a joining player never spawns on the big coin', () => {
	const { world, queue } = scriptedWorld();
	world.addPlayer('a');
	world.setPlayerPosition('a', { x: 100, y: 400 });
	world.setBigCoin({ x: 320, y: 262.5 });
	queue.push(0.5, 0.5);
	world.addPlayer('b');
	const snap = world.snapshot(0);
	const b = snap.players.find((p) => p.id === 'b')!;
	expect(circlesOverlap(b, PLAYER_RADIUS, snap.bigCoin!, BIG_COIN_RADIUS)).toBe(false);
});
