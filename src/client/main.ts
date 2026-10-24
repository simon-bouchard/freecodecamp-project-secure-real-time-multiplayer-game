import { type Socket, io } from 'socket.io-client';
import { RENDER_DELAY_MS, TICK_MS } from '../shared/constants.js';
import { NO_INPUT, calculateRank } from '../shared/game.js';
import type { ClientToServerEvents, InputState, ServerToClientEvents } from '../shared/protocol.js';
import { Keyboard } from './input.js';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import { drawFrame } from './render.js';

const canvas = document.getElementById('game-window') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
const keyboard = new Keyboard(window);
const buffer = new SnapshotBuffer();
const predictor = new Predictor();
let lastSent: InputState = NO_INPUT;

function sameInput(a: InputState, b: InputState): boolean {
	return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right;
}

socket.on('connect', () => {
	predictor.reset();
	buffer.clear();
	lastSent = NO_INPUT;
});

socket.on('snapshot', (snapshot) => {
	buffer.push(snapshot, performance.now());
	const self = snapshot.players.find((p) => p.id === socket.id);
	if (self) {
		predictor.reconcile(self);
	}
});

setInterval(() => {
	const input = keyboard.state;
	const held = input.up || input.down || input.left || input.right;
	if (!held && sameInput(input, lastSent)) {
		return;
	}
	const msg = predictor.applyLocalInput(input);
	if (msg) {
		socket.emit('input', msg);
		lastSent = msg.input;
	}
}, TICK_MS);

let lastFrame = performance.now();

function frame(now: number): void {
	const frameMs = now - lastFrame;
	lastFrame = now;

	const latest = buffer.latest();
	const others = buffer.sample(buffer.serverTimeAt(now) - RENDER_DELAY_MS);
	if (socket.id) {
		others.delete(socket.id);
	}
	const players = latest?.players ?? [];
	const id = socket.id ?? '';

	drawFrame(ctx, {
		self: predictor.position ? predictor.displayPosition(frameMs) : null,
		others,
		coin: latest?.coin ?? null,
		score: players.find((p) => p.id === id)?.score ?? 0,
		rank: calculateRank(players, id),
	});
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
