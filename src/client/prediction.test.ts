import { expect, test } from 'vitest';
import { KNOCK_DECAY, TICK_DT, TICK_MS } from '../shared/constants.js';
import { NO_MOVE, knockStep, movePlayer } from '../shared/game.js';
import type { PlayerState } from '../shared/protocol.js';
import { Predictor } from './prediction.js';

const RIGHT = { x: 1, y: 0 };

function server(x: number, lastSeq: number): PlayerState {
	return {
		id: 'me',
		name: 'me',
		color: '#ff4d4d',
		x,
		y: 100,
		score: 0,
		lastSeq,
		effects: [],
		knock: { x: 0, y: 0 },
		dash: null,
		dashReadyAt: 0,
	};
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

test('nextStepFactor reflects the effects that will apply to the next input', () => {
	const p = new Predictor();
	p.reconcile(withEffect(server(100, 0), 'speed', 1, 0), 0);
	expect(p.nextStepFactor()).toBeCloseTo(1.5);
	p.applyLocalInput(RIGHT);
	expect(p.nextStepFactor()).toBeCloseTo(1);
});

test('replay applies the server knockback after each pending input, like the server', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	for (let i = 0; i < 3; i++) p.applyLocalInput(RIGHT);
	p.reconcile({ ...server(100, 0), knock: { x: 600, y: 0 } });

	let pos = { x: 100, y: 100 };
	let knock = { x: 600, y: 0 };
	for (let i = 0; i < 3; i++) {
		({ pos, knock } = knockStep(movePlayer(pos, RIGHT, TICK_DT), knock));
	}
	expect(p.position!.x).toBeCloseTo(pos.x);
	expect(p.knocked).toBe(true);
});

test('a local input also slides with the knockback, which fades', () => {
	const p = new Predictor();
	p.reconcile({ ...server(100, 0), knock: { x: 600, y: 0 } });
	p.applyLocalInput(NO_MOVE);
	expect(p.position!.x).toBeCloseTo(100 + 600 * TICK_DT);
	p.applyLocalInput(NO_MOVE);
	expect(p.position!.x).toBeCloseTo(100 + 600 * TICK_DT * (1 + KNOCK_DECAY));
});

test('knocked is false without knockback', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	expect(p.knocked).toBe(false);
});

test('a predicted dash runs five inputs and the replay of an acked dash matches it', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	expect(p.requestDash(0)).toBe(true);
	const first = p.applyLocalInput(RIGHT)!;
	expect(first.dash).toBe(true);
	expect(p.position!.x).toBeCloseTo(130);
	expect(p.requestDash(0)).toBe(false);
	for (let i = 0; i < 4; i++) p.applyLocalInput(NO_MOVE);
	expect(p.position!.x).toBeCloseTo(250);
	expect(p.dashing).toBe(false);

	p.reconcile({ ...server(130, 1), dash: { left: 4, dir: RIGHT }, dashReadyAt: 3000 });
	expect(p.position!.x).toBeCloseTo(250);
});

test('the dash cooldown is respected locally and from the server', () => {
	const p = new Predictor();
	p.reconcile(server(100, 0));
	p.requestDash(0);
	for (let i = 0; i < 5; i++) p.applyLocalInput(NO_MOVE);
	expect(p.requestDash(2900)).toBe(false);
	p.reconcile({ ...server(250, 5), dashReadyAt: 5000 });
	expect(p.requestDash(4000)).toBe(false);
	expect(p.requestDash(5000)).toBe(true);
});

test('a dash while standing still goes the way we last moved', () => {
	const p = new Predictor();
	p.reconcile(server(300, 0));
	p.applyLocalInput({ x: 0, y: 1 });
	p.requestDash(0);
	const msg = p.applyLocalInput(NO_MOVE)!;
	expect(msg.move).toEqual({ x: 0, y: 1 });
	expect(p.position!.y).toBeCloseTo(100 + 10 + 30);
});
