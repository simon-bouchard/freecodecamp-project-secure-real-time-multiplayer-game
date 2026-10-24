import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Server } from 'socket.io';
import { TICK_MS } from '../shared/constants.js';
import { isValidInputMessage } from '../shared/game.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.js';
import { createApp } from './app.js';
import { World } from './world.js';

export interface GameServer {
	port: number;
	world: World;
	close(): Promise<void>;
}

export interface ServerOptions {
	port: number;
	clientDir?: string;
	world?: World;
	tickMs?: number;
}

/** Start the HTTP + socket.io server and the fixed-rate game loop. */
export async function startServer(opts: ServerOptions): Promise<GameServer> {
	const world = opts.world ?? new World();
	const app = createApp(opts.clientDir ?? path.resolve('dist/client'));
	const httpServer = createServer(app);
	const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

	io.on('connection', (socket) => {
		world.addPlayer(socket.id);
		socket.on('input', (msg: unknown) => {
			if (isValidInputMessage(msg)) {
				world.queueInput(socket.id, msg);
			}
		});
		socket.on('disconnect', () => world.removePlayer(socket.id));
	});

	const loop = setInterval(() => {
		world.step();
		io.emit('snapshot', world.snapshot(Date.now()));
	}, opts.tickMs ?? TICK_MS);

	await new Promise<void>((resolve) => httpServer.listen(opts.port, resolve));
	const { port } = httpServer.address() as AddressInfo;

	return {
		port,
		world,
		close: async () => {
			clearInterval(loop);
			await io.close();
		},
	};
}
