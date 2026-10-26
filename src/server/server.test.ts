import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Socket, io } from 'socket.io-client';
import { afterEach, expect, test } from 'vitest';
import { PALETTE, ROUND_TICKS } from '../shared/constants.js';
import type { MapChoice } from '../shared/maps.js';
import { NO_INPUT } from '../shared/game.js';
import type {
	ClientToServerEvents,
	JoinResult,
	LeaderboardView,
	ServerToClientEvents,
	Snapshot,
} from '../shared/protocol.js';
import { type GameServer, startServer } from './server.js';
import { SqliteScoreStore } from './scores/sqlite.js';
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

function join(
	client: Client,
	name: string,
	color: string,
	token?: string,
	map?: MapChoice,
): Promise<JoinResult> {
	return client.emitWithAck('join', {
		name,
		color,
		...(token ? { token } : {}),
		...(map ? { map } : {}),
	});
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
	a.emit('input', { seq: 1, move: { x: 1, y: 0 } });
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
	a.emit('input', { seq: 1, move: { x: 1, y: 0 } });
	const first = await nextSnapshot(a);
	const later = await nextSnapshot(a, (s) => s.tick > first.tick + 2);
	expect(later.players).toEqual([]);
});

test('in development the root page points to the dev client', async () => {
	server = await startServer({ port: 0, devClientUrl: 'http://localhost:5173' });
	const res = await fetch(`http://localhost:${server.port}/`);
	expect(res.status).toBe(200);
	expect(await res.text()).toContain('http://localhost:5173');
});

test('picking up a boost shows up in snapshots', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect(0);
	await nextSnapshot(a, (s) => s.players.length === 1);
	world.setPlayerPosition(a.id!, { x: 300, y: 300 });
	world.addItem('speed', { x: 300, y: 300 });
	const snap = await nextSnapshot(a, (s) => s.items.length === 0);
	const self = snap.players[0]!;
	expect(self.effects.map((e) => e.kind)).toEqual(['speed']);
	expect(self.effects[0]!.endsAt).toBeGreaterThan(snap.time);
});

test('the player key from the connection reaches round results; malformed keys are dropped', async () => {
	const results: { name: string; key: string | null }[] = [];
	const world = new World(Math.random, undefined, {
		onRoundEnd: (r) => results.push(...r.map(({ name, key }) => ({ name, key }))),
	});
	server = await startServer({ port: 0, world });
	const key = crypto.randomUUID();
	const keyed: Client = io(`http://localhost:${server.port}`, {
		transports: ['websocket'],
		auth: { playerKey: key },
	});
	const bogus: Client = io(`http://localhost:${server.port}`, {
		transports: ['websocket'],
		auth: { playerKey: 'not-a-uuid' },
	});
	clients.push(keyed, bogus);
	await Promise.all([keyed, bogus].map((c) => new Promise((r) => c.on('connect', () => r(null)))));
	await join(keyed, 'Keyed', PALETTE[0]!);
	await join(bogus, 'Bogus', PALETTE[1]!);
	while (world.phase !== 'results') world.step();
	expect(results).toEqual(
		expect.arrayContaining([
			{ name: 'Keyed', key },
			{ name: 'Bogus', key: null },
		]),
	);
});

test('each player gets their own leaderboard on connect and after a round', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const keys = [crypto.randomUUID(), crypto.randomUUID()];
	const [a, b] = keys.map(
		(playerKey) =>
			io(`http://localhost:${server!.port}`, {
				transports: ['websocket'],
				auth: { playerKey },
			}) as Client,
	);
	clients.push(a!, b!);
	const views = new Map<Client, LeaderboardView[]>([
		[a!, []],
		[b!, []],
	]);
	for (const c of [a!, b!]) c.on('leaderboard', (v) => views.get(c)!.push(v));
	await Promise.all([a!, b!].map((c) => new Promise((r) => c.on('connect', () => r(null)))));
	await join(a!, 'Ann', PALETTE[0]!);
	await join(b!, 'Bob', PALETTE[1]!);
	await new Promise((r) => setTimeout(r, 50));
	expect(views.get(a!)![0]!.boards.all.everyone).toEqual([]);

	world.setScore(a!.id!, 3);
	world.setScore(b!.id!, 5);
	while (world.phase !== 'results') world.step();
	await new Promise((r) => setTimeout(r, 100));

	const viewA = views.get(a!)!.at(-1)!;
	const viewB = views.get(b!)!.at(-1)!;
	expect(viewA.boards.today.everyone).toEqual([
		{ name: 'Bob', score: 5, self: false },
		{ name: 'Ann', score: 3, self: true },
	]);
	expect(viewA.boards.today.mine.map((r) => r.name)).toEqual(['Ann']);
	expect(viewB.boards.today.mine.map((r) => r.name)).toEqual(['Bob']);
	expect(viewA.highlights).toEqual(expect.arrayContaining([{ playerId: b!.id, period: 'all' }]));
	for (const view of [viewA, viewB]) {
		for (const key of keys) expect(JSON.stringify(view)).not.toContain(key);
	}
});

test('closing the server twice is harmless', async () => {
	const s = await startServer({ port: 0 });
	await s.close();
	await expect(s.close()).resolves.toBeUndefined();
});

test('the game keeps running when the score store fails', async () => {
	const failing = new SqliteScoreStore(':memory:');
	failing.record = () => {
		throw new Error('disk full');
	};
	failing.top = () => {
		throw new Error('disk full');
	};
	const world = new World();
	server = await startServer({ port: 0, world, scores: failing });
	const a = io(`http://localhost:${server.port}`, {
		transports: ['websocket'],
		auth: { playerKey: crypto.randomUUID() },
	}) as Client;
	clients.push(a);
	await new Promise((r) => a.on('connect', () => r(null)));
	await join(a, 'Ann', PALETTE[0]!);
	world.setScore(a.id!, 3);
	while (world.phase !== 'results') world.step();
	const first = await nextSnapshot(a);
	const later = await nextSnapshot(a, (s) => s.tick > first.tick + 2);
	expect(later.round.phase).toBe('results');
});

test('pages loaded before the update still move with the old key-flag input', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const a = await connect(0);
	await nextSnapshot(a, (s) => s.players.length === 1);
	world.setPlayerPosition(a.id!, { x: 300, y: 300 });
	const legacy = a as unknown as { emit: (event: string, payload: unknown) => void };
	legacy.emit('input', { seq: 1, input: { ...NO_INPUT, right: true } });
	const snap = await nextSnapshot(a, (s) => s.players[0]?.lastSeq === 1);
	expect(snap.players[0]?.x).toBeCloseTo(310);
});

test('the first player joins straight into a round on their picked map; socket votes count', async () => {
	const world = new World();
	server = await startServer({ port: 0, world });
	const client = await connect();
	await join(client, 'Ann', PALETTE[0]!, undefined, 'crossroads');
	const playing = await nextSnapshot(client, (s) => s.round.phase === 'playing');
	expect(playing.round.map).toBe('crossroads');
	for (let i = 0; i < ROUND_TICKS; i++) world.step();
	client.emit('vote', 'pinball');
	const snap = await nextSnapshot(client, (s) => s.round.votes.pinball === 1);
	expect(snap.players[0]!.vote).toBe('pinball');
});
