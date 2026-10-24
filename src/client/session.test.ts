import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { afterEach, expect, test } from 'vitest';
import { PALETTE } from '../shared/constants.js';
import { NO_INPUT } from '../shared/game.js';
import type { InputState, JoinFailure, Snapshot } from '../shared/protocol.js';
import { type GameServer, startServer } from '../server/server.js';
import { World } from '../server/world.js';
import { type GameSocket, GameSession } from './session.js';

/** Simulates the server not having noticed a dropped connection yet. */
class StickyWorld extends World {
	override removePlayer(): void {}
}

let server: GameServer | undefined;
const sockets: GameSocket[] = [];

afterEach(async () => {
	sockets.splice(0).forEach((s) => s.disconnect());
	await server?.close();
});

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const poll = setInterval(() => {
			if (predicate()) {
				clearInterval(poll);
				resolve();
			} else if (Date.now() - started > timeoutMs) {
				clearInterval(poll);
				reject(new Error('timed out'));
			}
		}, 5);
	});
}

function selfIn(snapshot: Snapshot | undefined, id: string | undefined) {
	return snapshot?.players.find((p) => p.id === id);
}

function newSocket(): GameSocket {
	const socket: GameSocket = io(`http://localhost:${server!.port}`, {
		autoConnect: false,
		transports: ['websocket'],
	});
	sockets.push(socket);
	return socket;
}

async function connected(socket: GameSocket): Promise<void> {
	socket.connect();
	await waitFor(() => socket.connected);
}

test('movement works again after a reconnect while a key was held', async () => {
	server = await startServer({ port: 0 });
	let input: InputState = { ...NO_INPUT, right: true };
	const socket = newSocket();
	const session = new GameSession(socket, () => input);

	await connected(socket);
	await session.join('Ann', PALETTE[0]!);
	await waitFor(() => session.predictor.position !== null);
	for (let i = 0; i < 30; i++) session.tick();

	socket.disconnect();
	for (let i = 0; i < 30; i++) session.tick();

	socket.connect();
	await waitFor(() => session.joined && session.predictor.position !== null);
	for (let i = 0; i < 10; i++) session.tick();
	input = NO_INPUT;

	await waitFor(() => selfIn(session.buffer.latest(), socket.id)?.lastSeq === 10);
	expect(session.predictor.pending).toEqual([]);
});

test('spectator sends no input', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const socket = newSocket();
	const session = new GameSession(socket, () => ({ ...NO_INPUT, right: true }));
	await connected(socket);
	await waitFor(() => session.buffer.latest() !== undefined);
	for (let i = 0; i < 10; i++) session.tick();
	expect(session.joined).toBe(false);
	expect(session.predictor.pending).toEqual([]);
	expect(world.pendingInputs(socket.id!)).toEqual([]);
});

test('join then reconnect keeps colour and score', async () => {
	const world = new StickyWorld();
	server = await startServer({ port: 0, world });
	const socket = newSocket();
	const session = new GameSession(socket, () => NO_INPUT);
	await connected(socket);
	const res = await session.join('Ann', PALETTE[3]!);
	expect(res.ok).toBe(true);
	const oldId = socket.id!;
	world.setScore(oldId, 3);

	socket.disconnect();
	socket.connect();
	await waitFor(() => session.joined && socket.id !== oldId);
	await waitFor(() => selfIn(session.buffer.latest(), socket.id) !== undefined);
	const snap = session.buffer.latest()!;
	expect(selfIn(snap, socket.id)).toMatchObject({ color: PALETTE[3], score: 3, name: 'Ann' });
	expect(selfIn(snap, oldId)).toBeUndefined();
});

test('rejoin with a taken colour calls onRejoinFailed', async () => {
	server = await startServer({ port: 0 });
	const failures: JoinFailure[] = [];
	const socket = newSocket();
	const session = new GameSession(
		socket,
		() => NO_INPUT,
		(reason) => failures.push(reason),
	);
	await connected(socket);
	await session.join('Ann', PALETTE[5]!);

	socket.disconnect();
	const other = newSocket();
	await connected(other);
	expect(await other.emitWithAck('join', { name: 'Bob', color: PALETTE[5]! })).toMatchObject({
		ok: true,
	});

	socket.connect();
	await waitFor(() => failures.length > 0);
	expect(failures).toEqual(['color-taken']);
	expect(session.joined).toBe(false);
});

test('view lists players with names and colours', async () => {
	server = await startServer({ port: 0 });
	const socket = newSocket();
	const session = new GameSession(socket, () => NO_INPUT);
	await connected(socket);
	await session.join('Ann', PALETTE[1]!);
	await waitFor(() => session.predictor.position !== null);
	const view = session.view(performance.now());
	expect(view.players).toEqual([
		expect.objectContaining({ id: socket.id, name: 'Ann', color: PALETTE[1], self: true }),
	]);
	expect(view.scoreboard[0]).toMatchObject({ name: 'Ann', self: true, score: 0 });
	expect(view.round?.phase).toBe('playing');
	expect(view.selfId).toBe(socket.id);
});

test('double join only joins once', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const socket = newSocket();
	const session = new GameSession(socket, () => NO_INPUT);
	await connected(socket);
	const [first, second] = await Promise.all([
		session.join('Ann', PALETTE[0]!),
		session.join('Ann', PALETTE[0]!),
	]);
	expect(first.ok).toBe(true);
	expect(second).toEqual(first);
	expect(session.joined).toBe(true);
	await expect(session.join('Ann', PALETTE[0]!)).resolves.toEqual(first);
});

test('join gives up when the server never answers', async () => {
	const http = createServer();
	const silent = new Server(http);
	await new Promise<void>((resolve) => http.listen(0, resolve));
	const port = (http.address() as AddressInfo).port;
	const socket: GameSocket = io(`http://localhost:${port}`, { transports: ['websocket'] });
	sockets.push(socket);
	await waitFor(() => socket.connected);
	const session = new GameSession(socket, () => NO_INPUT, undefined, 100);
	expect(await session.join('Ann', PALETTE[0]!)).toEqual({ ok: false, reason: 'timeout' });
	expect(session.joined).toBe(false);
	socket.disconnect();
	await silent.close();
});
