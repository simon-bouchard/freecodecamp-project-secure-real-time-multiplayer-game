import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Server } from 'socket.io';
import { TICK_MS } from '../shared/constants.js';
import { isPlayerKey, isValidInputMessage, isValidJoinRequest } from '../shared/game.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.js';
import { createApp } from './app.js';
import { rankedBoards, recordRound, viewFor } from './scores/leaderboard.js';
import { SqliteScoreStore } from './scores/sqlite.js';
import type { ScoreStore } from './scores/store.js';
import { World } from './world.js';

export interface GameServer {
	port: number;
	world: World;
	close(): Promise<void>;
}

export interface ServerOptions {
	port: number;
	clientDir?: string;
	devClientUrl?: string;
	world?: World;
	tickMs?: number;
	/** Where runs are saved; defaults to an in-memory store (nothing persists). */
	scores?: ScoreStore;
}

/** Start the HTTP + socket.io server and the fixed-rate game loop. */
export async function startServer(opts: ServerOptions): Promise<GameServer> {
	const world = opts.world ?? new World();
	const app = createApp(opts.clientDir ?? path.resolve('dist/client'), opts.devClientUrl);
	const httpServer = createServer(app);
	const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
	const scores = opts.scores ?? new SqliteScoreStore(':memory:');
	/** Leaderboard key per connected socket; kept server-side only. */
	const keys = new Map<string, string | null>();

	world.addRoundEndListener((results) => {
		try {
			const now = Date.now();
			const { boards, highlights: byKey } = recordRound(scores, results, now);
			const highlights = results.flatMap(({ id, key }) => {
				const period = key ? byKey.get(key) : undefined;
				return period ? [{ playerId: id, period }] : [];
			});
			for (const socket of io.sockets.sockets.values()) {
				const key = keys.get(socket.id) ?? null;
				socket.emit('leaderboard', viewFor(scores, boards, key, now, highlights));
			}
		} catch (error) {
			console.error('Could not record this round:', error);
		}
	});

	io.on('connection', (socket) => {
		const auth = socket.handshake.auth as { playerKey?: unknown };
		const key = isPlayerKey(auth.playerKey) ? auth.playerKey : null;
		keys.set(socket.id, key);
		try {
			const now = Date.now();
			socket.emit('leaderboard', viewFor(scores, rankedBoards(scores, now), key, now, []));
		} catch (error) {
			console.error('Could not load the leaderboard:', error);
		}
		socket.on('join', (req: unknown, ack: unknown) => {
			if (typeof ack !== 'function') {
				return;
			}
			ack(
				isValidJoinRequest(req)
					? world.join(socket.id, req, key)
					: { ok: false, reason: 'invalid' },
			);
		});
		socket.on('input', (msg: unknown) => {
			if (isValidInputMessage(msg)) {
				world.queueInput(socket.id, msg);
			}
		});
		socket.on('disconnect', () => {
			world.removePlayer(socket.id);
			keys.delete(socket.id);
		});
	});

	const loop = setInterval(() => {
		world.step();
		io.emit('snapshot', world.snapshot(Date.now()));
	}, opts.tickMs ?? TICK_MS);

	await new Promise<void>((resolve) => httpServer.listen(opts.port, resolve));
	const { port } = httpServer.address() as AddressInfo;
	let closed = false;

	return {
		port,
		world,
		close: async () => {
			if (closed) {
				return;
			}
			closed = true;
			clearInterval(loop);
			await io.close();
			scores.close();
		},
	};
}
