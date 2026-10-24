import { expect, test } from 'vitest';
import { NO_INPUT } from '../shared/game.js';
import type { PlayerState } from '../shared/protocol.js';
import { Predictor } from './prediction.js';

const RIGHT = { ...NO_INPUT, right: true };

function server(x: number, lastSeq: number): PlayerState {
	return { id: 'me', name: 'me', color: '#ff4d4d', x, y: 100, score: 0, lastSeq };
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
