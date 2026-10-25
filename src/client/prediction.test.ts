import { expect, test } from 'vitest';
import { TICK_MS } from '../shared/constants.js';
import { NO_MOVE } from '../shared/game.js';
import type { PlayerState } from '../shared/protocol.js';
import { Predictor } from './prediction.js';

const RIGHT = { x: 1, y: 0 };

function server(x: number, lastSeq: number): PlayerState {
	return { id: 'me', name: 'me', color: '#ff4d4d', x, y: 100, score: 0, lastSeq, effects: [] };
}

function predictorAfterThreeRights(): Predictor {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	p.applyLocalInput(RIGHT);
	p.applyLocalInput(RIGHT);
	p.applyLocalInput(RIGHT);
	return p;
}

test('no prediction before first snapshot', () => {
	expect(new Predictor().applyLocalInput(RIGHT)).toBeNull();
});

test('moves immediately', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	const msg = p.applyLocalInput(RIGHT);
	expect(msg?.seq).toBe(1);
	expect(p.position?.x).toBeCloseTo(110);
});

test('reconcile replays unacked inputs', () => {
	const p = predictorAfterThreeRights();
	p.reconcile(server(110, 1));
	expect(p.position?.x).toBeCloseTo(130);
	expect(p.pending.map((m) => m.seq)).toEqual([2, 3]);
});

test('reconcile matches server when all acked', () => {
	const p = predictorAfterThreeRights();
	p.reconcile(server(125, 3));
	expect(p.position?.x).toBe(125);
	expect(p.pending).toEqual([]);
});

test('large correction snaps', () => {
	const p = predictorAfterThreeRights();
	p.reconcile(server(400, 3));
	expect(p.displayPosition(16).x).toBe(400);
});

test('small correction is smoothed', () => {
	const p = predictorAfterThreeRights();
	p.reconcile(server(125, 3));
	const first = p.displayPosition(16).x;
	expect(first).toBeGreaterThan(125);
	expect(first).toBeLessThan(130);
	let x = first;
	for (let i = 0; i < 20; i++) x = p.displayPosition(16).x;
	expect(Math.abs(x - 125)).toBeLessThan(0.5);
});

test('reset clears state', () => {
	const p = predictorAfterThreeRights();
	p.reset();
	expect(p.position).toBeNull();
	expect(p.pending).toEqual([]);
	p.reconcile(server(100, 0));
	expect(p.applyLocalInput(RIGHT)?.seq).toBe(1);
});

test('draws between the previous and current predicted tick', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	p.applyLocalInput(RIGHT);
	expect(p.displayPosition(0, 0.5).x).toBeCloseTo(105);
	expect(p.displayPosition(0, 1).x).toBeCloseTo(110);
});

test('holdStill stops in-between drawing', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	p.applyLocalInput(RIGHT);
	p.holdStill();
	expect(p.displayPosition(0, 0.5).x).toBeCloseTo(110);
});

function withEffect(state: PlayerState, kind: 'speed' | 'slow', ticks: number, time: number) {
	return { ...state, effects: [{ kind, endsAt: time + ticks * TICK_MS }] };
}

test('replay applies an effect only to inputs before it ends', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	p.applyLocalInput(RIGHT);
	p.applyLocalInput(RIGHT);
	p.applyLocalInput(RIGHT);
	p.reconcile(withEffect(server(100, 0), 'speed', 2, 5000), 5000);
	expect(p.position?.x).toBeCloseTo(100 + 15 + 15 + 10);
});

test('new inputs use the effects active for their position in the queue', () => {
	const fast = new Predictor();
	fast.reconcile(withEffect(server(100, 0), 'speed', 5, 0), 0);
	fast.applyLocalInput(RIGHT);
	expect(fast.position?.x).toBeCloseTo(115);

	const slow = new Predictor();
	slow.reconcile(withEffect(server(100, 0), 'slow', 5, 0), 0);
	slow.applyLocalInput(RIGHT);
	expect(slow.position?.x).toBeCloseTo(105);

	const plain = new Predictor();
	plain.reconcile(server(100, 0));
	plain.applyLocalInput(RIGHT);
	expect(plain.position?.x).toBeCloseTo(110);
});

test('a half-length move is predicted at half speed and replayed the same way', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	p.applyLocalInput({ x: 0.5, y: 0 });
	expect(p.position?.x).toBeCloseTo(105);
	p.reconcile(server(100, 0));
	expect(p.position?.x).toBeCloseTo(105);
	expect(NO_MOVE).toEqual({ x: 0, y: 0 });
});
