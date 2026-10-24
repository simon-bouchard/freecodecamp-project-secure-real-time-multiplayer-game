import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Socket, io } from 'socket.io-client';
import { afterEach, expect, test } from 'vitest';
import { NO_INPUT } from '../shared/game.js';
import type { ClientToServerEvents, ServerToClientEvents, Snapshot } from '../shared/protocol.js';
import { type GameServer, startServer } from './server.js';
import { World } from './world.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer | undefined;
const clients: Client[] = [];

afterEach(async () => {
	clients.splice(0).forEach((c) => c.disconnect());
	await server?.close();
	server = undefined;
});

async function connect(): Promise<Client> {
	const client: Client = io(`http://localhost:${server!.port}`, { transports: ['websocket'] });
	clients.push(client);
	await new Promise<void>((resolve) => client.on('connect', resolve));
	return client;
}

function nextSnapshot(client: Client, predicate: (s: Snapshot) => boolean = () => true) {
	return new Promise<Snapshot>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('no matching snapshot')), 1000);
		const handler = (s: Snapshot) => {
			if (predicate(s)) {
				clearTimeout(timer);
				client.off('snapshot', handler);
				resolve(s);
			}
		};
		client.on('snapshot', handler);
	});
}

test('two clients touching the coin score exactly one point', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect();
	const b = await connect();
	await nextSnapshot(a, (s) => s.players.length === 2);
	world.setCoinPosition({ x: 300, y: 300 });
	world.setPlayerPosition(a.id!, { x: 300, y: 300 });
	world.setPlayerPosition(b.id!, { x: 300, y: 300 });
	const snap = await nextSnapshot(a);
	expect(snap.players.reduce((sum, p) => sum + p.score, 0)).toBe(1);
	expect(snap.coin.id).toBe(2);
});

test('input moves the player and is acked', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect();
	await nextSnapshot(a, (s) => s.players.length === 1);
	world.setPlayerPosition(a.id!, { x: 300, y: 300 });
	a.emit('input', { seq: 1, input: { ...NO_INPUT, right: true } });
	const snap = await nextSnapshot(a, (s) => s.players[0]?.lastSeq === 1);
	expect(snap.players[0]?.x).toBeCloseTo(310);
});

test('malformed input is ignored', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect();
	await nextSnapshot(a, (s) => s.players.length === 1);
	world.setPlayerPosition(a.id!, { x: 300, y: 300 });
	const raw = a as unknown as { emit: (event: string, payload: unknown) => void };
	for (const bad of [null, 'x', { seq: '1' }, { seq: 1, input: { up: 'yes' } }]) {
		raw.emit('input', bad);
	}
	const first = await nextSnapshot(a);
	await nextSnapshot(a);
	const later = await nextSnapshot(a);
	expect(later.tick).toBeGreaterThan(first.tick);
	expect(later.players[0]).toMatchObject({ x: 300, y: 300, lastSeq: 0 });
});

test('disconnect removes player', async () => {
	server = await startServer({ port: 0 });
	const a = await connect();
	const b = await connect();
	await nextSnapshot(a, (s) => s.players.length === 2);
	b.disconnect();
	const snap = await nextSnapshot(a, (s) => s.players.length === 1);
	expect(snap.players[0]?.id).toBe(a.id);
});

test('serves index.html with CSP', async () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'coin-race-'));
	writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title>');
	server = await startServer({ port: 0, clientDir: dir });
	const res = await fetch(`http://localhost:${server.port}/`);
	expect(res.status).toBe(200);
	expect(await res.text()).toContain('<title>t</title>');
	expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
});
