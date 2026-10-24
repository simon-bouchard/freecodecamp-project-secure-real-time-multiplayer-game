import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Socket, io } from 'socket.io-client';
import { afterEach, expect, test } from 'vitest';
import { PALETTE } from '../shared/constants.js';
import { NO_INPUT } from '../shared/game.js';
import type {
	ClientToServerEvents,
	JoinResult,
	ServerToClientEvents,
	Snapshot,
} from '../shared/protocol.js';
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

/** Connect a client; with a palette index it also joins as `P<index>` in that colour. */
async function connect(colorIndex?: number): Promise<Client> {
	const client: Client = io(`http://localhost:${server!.port}`, { transports: ['websocket'] });
	clients.push(client);
	await new Promise<void>((resolve) => client.on('connect', resolve));
	if (colorIndex !== undefined) {
		const res = await join(client, `P${colorIndex}`, PALETTE[colorIndex]!);
		if (!res.ok) throw new Error(`join failed: ${res.reason}`);
	}
	return client;
}

function join(client: Client, name: string, color: string, token?: string): Promise<JoinResult> {
	return client.emitWithAck('join', token ? { name, color, token } : { name, color });
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
	const a = await connect(0);
	const b = await connect(1);
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
	const a = await connect(0);
	await nextSnapshot(a, (s) => s.players.length === 1);
	world.setPlayerPosition(a.id!, { x: 300, y: 300 });
	a.emit('input', { seq: 1, input: { ...NO_INPUT, right: true } });
	const snap = await nextSnapshot(a, (s) => s.players[0]?.lastSeq === 1);
	expect(snap.players[0]?.x).toBeCloseTo(310);
});

test('malformed input is ignored', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect(0);
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
	const a = await connect(0);
	const b = await connect(1);
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

test('spectators receive snapshots without a player', async () => {
	server = await startServer({ port: 0 });
	const a = await connect();
	const snap = await nextSnapshot(a);
	expect(snap.players).toEqual([]);
});

test('join over the socket succeeds and returns a token', async () => {
	server = await startServer({ port: 0 });
	const a = await connect();
	const res = await join(a, 'Ann', PALETTE[2]!);
	expect(res.ok).toBe(true);
	expect(res.ok && res.token.length).toBeGreaterThan(0);
	const snap = await nextSnapshot(a, (s) => s.players.length === 1);
	expect(snap.players[0]).toMatchObject({ id: a.id, name: 'Ann', color: PALETTE[2] });
});

test('invalid join is rejected', async () => {
	server = await startServer({ port: 0 });
	const a = await connect();
	expect(await join(a, '', PALETTE[0]!)).toEqual({ ok: false, reason: 'invalid' });
	const raw = a as unknown as { emitWithAck: (e: string, p: unknown) => Promise<JoinResult> };
	expect(await raw.emitWithAck('join', null)).toEqual({ ok: false, reason: 'invalid' });
});

test('two clients picking the same colour: second gets color-taken', async () => {
	server = await startServer({ port: 0 });
	const a = await connect();
	const b = await connect();
	const [first, second] = await Promise.all([
		join(a, 'Ann', PALETTE[4]!),
		join(b, 'Bob', PALETTE[4]!),
	]);
	expect([first.ok, second.ok].sort()).toEqual([false, true]);
	const failed = first.ok ? second : first;
	expect(failed).toEqual({ ok: false, reason: 'color-taken' });
});

test('rejoining with a token takes the player back', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect();
	const res = await join(a, 'Ann', PALETTE[6]!);
	if (!res.ok) throw new Error('join failed');
	world.setScore(a.id!, 3);
	const b = await connect();
	expect(await join(b, 'Ann', PALETTE[6]!, res.token)).toEqual(res);
	a.disconnect();
	await nextSnapshot(b, (s) => s.players.length === 1 && s.players[0]?.id === b.id);
	const snap = await nextSnapshot(b);
	expect(snap.players).toHaveLength(1);
	expect(snap.players[0]).toMatchObject({ id: b.id, color: PALETTE[6], score: 3 });
});

test('input from a spectator is ignored', async () => {
	server = await startServer({ port: 0 });
	const a = await connect();
	a.emit('input', { seq: 1, input: { ...NO_INPUT, right: true } });
	const first = await nextSnapshot(a);
	const later = await nextSnapshot(a, (s) => s.tick > first.tick + 2);
	expect(later.players).toEqual([]);
});
