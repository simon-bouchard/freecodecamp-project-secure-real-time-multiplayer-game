import { expect, test } from 'vitest';
import { noVotes } from '../../shared/maps.js';
import type { RoundState } from '../../shared/protocol.js';
import type { FrameView } from '../render.js';
import { roundStatus } from './shared.js';

function view(round: Partial<RoundState> | null): FrameView {
	return {
		serverNow: 0,
		round: round && {
			phase: 'playing',
			endsAt: 55_000,
			winners: [],
			map: 'open',
			votes: noVotes(),
			...round,
		},
	} as FrameView;
}

test('the header shows the time and the map while playing', () => {
	expect(roundStatus(view({ map: 'pillars' }))).toBe('Time 0:55 · Pillars');
	expect(roundStatus(view({ map: 'open' }))).toBe('Time 0:55 · Open field');
});

test('the header counts down the results', () => {
	expect(roundStatus(view({ phase: 'results', endsAt: 8_000 }))).toBe('Next round 0:08');
	expect(roundStatus(view(null))).toBe('Waiting for players');
});
