import { expect, test } from 'vitest';
import { PALETTE } from '../shared/constants.js';
import { pickDefaultColor, voteTitle } from './ui.js';

const first = PALETTE[0]!;
const second = PALETTE[1]!;

test('keeps the current colour while it is free', () => {
	expect(pickDefaultColor(new Set([second]), first, () => 0.99)).toBe(first);
});

test('picks a random free colour when none is selected', () => {
	expect(pickDefaultColor(new Set([first]), null, () => 0)).toBe(second);
	expect(pickDefaultColor(new Set(), null, () => 0.999)).toBe(PALETTE.at(-1));
});

test('replaces the current colour when someone takes it', () => {
	expect(pickDefaultColor(new Set([first]), first, () => 0)).toBe(second);
});

test('returns null when every colour is taken', () => {
	expect(pickDefaultColor(new Set(PALETTE), null, () => 0)).toBeNull();
});

test('the map vote title counts down and tells spectators to join', () => {
	expect(voteTitle('voting', 7_200, true)).toBe('Pick the map · 8 s');
	expect(voteTitle('results', 5_100, true)).toBe('Vote for the next map · 6 s');
	expect(voteTitle('results', 5_100, false)).toBe('Next map vote · 6 s (join to vote)');
	expect(voteTitle('results', -40, true)).toBe('Vote for the next map · 0 s');
});
