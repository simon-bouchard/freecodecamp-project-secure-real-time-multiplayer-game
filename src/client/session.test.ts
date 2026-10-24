import { io } from 'socket.io-client';
import { afterEach, expect, test } from 'vitest';
import { NO_INPUT } from '../shared/game.js';
import type { InputState, Snapshot } from '../shared/protocol.js';
import { type GameServer, startServer } from '../server/server.js';
import { type GameSocket, GameSession } from './session.js';

let server: GameServer | undefined;
let socket: GameSocket | undefined;

afterEach(async () => {
	socket?.disconnect();
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

test('movement works again after a reconnect while a key was held', async () => {
	server = await startServer({ port: 0 });
	let input: InputState = { ...NO_INPUT, right: true };
	socket = io(`http://localhost:${server.port}`, {
		autoConnect: false,
		transports: ['websocket'],
	});
	const session = new GameSession(socket, () => input);

	socket.connect();
	await waitFor(() => session.predictor.position !== null);
	for (let i = 0; i < 30; i++) session.tick();

	socket.disconnect();
	for (let i = 0; i < 30; i++) session.tick();

	socket.connect();
	await waitFor(() => socket!.connected && session.predictor.position !== null);
	for (let i = 0; i < 10; i++) session.tick();
	input = NO_INPUT;

	await waitFor(() => selfIn(session.buffer.latest(), socket!.id)?.lastSeq === 10);
	expect(session.predictor.pending).toEqual([]);
});
