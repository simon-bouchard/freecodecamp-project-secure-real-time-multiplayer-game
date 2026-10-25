import { expect, test } from 'vitest';
import { PALETTE } from '../shared/constants.js';
import {
	loadBoardPrefs,
	loadOrCreatePlayerKey,
	loadProfile,
	loadThemeId,
	saveBoardPrefs,
	saveProfile,
	saveThemeId,
} from './storage.js';

function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (k) => data.get(k) ?? null,
		key: (i) => [...data.keys()][i] ?? null,
		removeItem: (k) => void data.delete(k),
		setItem: (k, v) => void data.set(k, v),
	};
}

function throwingStorage(): Storage {
	const fail = () => {
		throw new Error('blocked');
	};
	return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

test('profile round-trips', () => {
	const storage = memoryStorage();
	saveProfile(storage, { name: 'Ann', color: PALETTE[2]! });
	expect(loadProfile(storage)).toEqual({ name: 'Ann', color: PALETTE[2] });
});

test('missing storage is harmless', () => {
	expect(loadProfile(null)).toBeNull();
	expect(() => saveProfile(null, { name: 'Ann', color: PALETTE[0]! })).not.toThrow();
});

test('throwing storage is harmless', () => {
	const storage = throwingStorage();
	expect(loadProfile(storage)).toBeNull();
	expect(() => saveProfile(storage, { name: 'Ann', color: PALETTE[0]! })).not.toThrow();
});

test('colour outside the palette is ignored', () => {
	const storage = memoryStorage();
	storage.setItem('coin-race-profile', JSON.stringify({ name: 'Ann', color: '#000000' }));
	expect(loadProfile(storage)).toBeNull();
});

test('bad JSON is ignored', () => {
	const storage = memoryStorage();
	storage.setItem('coin-race-profile', '{nope');
	expect(loadProfile(storage)).toBeNull();
});

test('theme choice round-trips and unknown values fall back to the default', () => {
	const storage = memoryStorage();
	expect(loadThemeId(storage)).toBe('ninja');
	saveThemeId(storage, 'classic');
	expect(loadThemeId(storage)).toBe('classic');
	storage.setItem('coin-race-theme', 'vaporwave');
	expect(loadThemeId(storage)).toBe('ninja');
	expect(loadThemeId(throwingStorage())).toBe('ninja');
	expect(loadThemeId(null)).toBe('ninja');
	expect(() => saveThemeId(throwingStorage(), 'classic')).not.toThrow();
});

test('the player key is created once and then reused', () => {
	const storage = memoryStorage();
	const first = loadOrCreatePlayerKey(storage);
	expect(first).toMatch(/^[0-9a-f-]{36}$/);
	expect(loadOrCreatePlayerKey(storage)).toBe(first);
});

test('an invalid stored key is replaced, and missing storage still yields a key', () => {
	const storage = memoryStorage();
	storage.setItem('coin-race-player-key', 'tampered');
	expect(loadOrCreatePlayerKey(storage, () => '11111111-2222-3333-4444-555555555555')).toBe(
		'11111111-2222-3333-4444-555555555555',
	);
	expect(loadOrCreatePlayerKey(null)).toMatch(/^[0-9a-f-]{36}$/);
	expect(loadOrCreatePlayerKey(throwingStorage())).toMatch(/^[0-9a-f-]{36}$/);
});

test('board choices default to today/everyone, round-trip, and ignore bad data', () => {
	const storage = memoryStorage();
	expect(loadBoardPrefs(storage)).toEqual({ period: 'today', scope: 'everyone' });
	saveBoardPrefs(storage, { period: 'all', scope: 'mine' });
	expect(loadBoardPrefs(storage)).toEqual({ period: 'all', scope: 'mine' });
	storage.setItem('coin-race-board', '{"period":"week","scope":"mine"}');
	expect(loadBoardPrefs(storage)).toEqual({ period: 'today', scope: 'mine' });
	storage.setItem('coin-race-board', 'not json');
	expect(loadBoardPrefs(storage)).toEqual({ period: 'today', scope: 'everyone' });
	expect(loadBoardPrefs(throwingStorage())).toEqual({ period: 'today', scope: 'everyone' });
	expect(() => saveBoardPrefs(throwingStorage(), { period: 'all', scope: 'mine' })).not.toThrow();
});
