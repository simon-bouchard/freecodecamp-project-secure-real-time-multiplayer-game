import { expect, test } from 'vitest';
import { type AudioOutput, type SoundSet, SoundBoard } from './board.js';
import type { SoundCue } from './cues.js';
import type { Synth } from './synth.js';

function fakeOutput(running = true): AudioOutput & { resumed: number; preloaded: string[] } {
	return {
		synth: { now: 5 } as Synth,
		running,
		resumed: 0,
		preloaded: [],
		resume() {
			this.resumed++;
		},
		preload(urls) {
			this.preloaded.push(...urls);
		},
	};
}

function recordingSet(played: [SoundCue, number][]): SoundSet {
	const record = (cue: SoundCue) => (_: Synth, t: number) => void played.push([cue, t]);
	return {
		coin: record('coin'),
		roundOver: record('roundOver'),
		personalBest: record('personalBest'),
	};
}

test('nothing plays until audio is unlocked by a user gesture', () => {
	const played: [SoundCue, number][] = [];
	const output = fakeOutput();
	const board = new SoundBoard(true, () => output);
	board.play(['coin'], recordingSet(played));
	expect(played).toEqual([]);
	board.unlock();
	board.play(['coin'], recordingSet(played));
	expect(played).toEqual([['coin', 5.02]]);
	expect(output.resumed).toBe(1);
});

test('personal best waits a beat after the round-end sound', () => {
	const played: [SoundCue, number][] = [];
	const board = new SoundBoard(true, () => fakeOutput());
	board.unlock();
	board.play(['roundOver', 'personalBest'], recordingSet(played));
	expect(played).toEqual([
		['roundOver', 5.02],
		['personalBest', 5.02 + 1.1],
	]);
});

test('turned off: no audio is opened and nothing plays until turned back on', () => {
	const played: [SoundCue, number][] = [];
	let opened = 0;
	const board = new SoundBoard(false, () => {
		opened++;
		return fakeOutput();
	});
	board.unlock();
	board.play(['coin'], recordingSet(played));
	expect(opened).toBe(0);
	expect(played).toEqual([]);

	board.setEnabled(true);
	expect(board.enabled).toBe(true);
	board.play(['coin'], recordingSet(played));
	expect(opened).toBe(1);
	expect(played).toHaveLength(1);

	board.setEnabled(false);
	board.play(['coin'], recordingSet(played));
	expect(played).toHaveLength(1);
});

test('a suspended output or a theme without sounds plays nothing', () => {
	const played: [SoundCue, number][] = [];
	const suspended = new SoundBoard(true, () => fakeOutput(false));
	suspended.unlock();
	suspended.play(['coin'], recordingSet(played));
	expect(played).toEqual([]);

	const silentTheme = new SoundBoard(true, () => fakeOutput());
	silentTheme.unlock();
	expect(() => silentTheme.play(['coin', 'win'], undefined)).not.toThrow();
	silentTheme.play(['win'], recordingSet(played));
	expect(played).toEqual([]);
});

test("unlocking preloads the theme's sound files, but not while sound is off", () => {
	const output = fakeOutput();
	const off = new SoundBoard(false, () => output);
	off.unlock(['/sounds/a.mp3']);
	expect(output.preloaded).toEqual([]);

	const on = new SoundBoard(true, () => output);
	on.unlock(['/sounds/a.mp3', '/sounds/b.mp3']);
	expect(output.preloaded).toEqual(['/sounds/a.mp3', '/sounds/b.mp3']);
});
