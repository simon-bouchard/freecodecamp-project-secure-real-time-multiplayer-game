import type { SoundSet } from './board.js';

/** C major, for bright clean melodies. */
const C = {
	C4: 261.63,
	G4: 392,
	C5: 523.25,
	E5: 659.25,
	G5: 783.99,
	C6: 1046.5,
	E6: 1318.5,
	G6: 1568,
	A6: 1760,
	C7: 2093,
};

/** Flat sounds: clean blips, marimba, glass chimes and one-tone jumps. */
export const flatSounds: SoundSet = {
	coin: (s, t) =>
		s.stepTone(
			t,
			[
				[C.E6, 0],
				[C.A6, 0.04],
			],
			{ dur: 0.2, slide: 0.008, attack: 0.015 },
		),
	ramen: (s, t) =>
		[C.C5, C.E5, C.G5, C.C6, C.E6].forEach((f, i) => s.blip(f, t + i * 0.05, { gain: 0.25 })),
	speed: (s, t) => {
		s.noise(t, {
			type: 'lowpass',
			freq: 300,
			to: 2500,
			q: 0.7,
			gain: 1.1,
			dur: 0.12,
			attack: 0.18,
		});
		s.blip(C.C6, t + 0.2, { gain: 0.2 });
	},
	magnet: (s, t) => {
		s.tone(500, t, { dur: 0.3, gain: 0.35, to: 750 });
		s.tone(1100, t, { dur: 0.3, gain: 0.25, to: 750 });
		s.glass(C.G6, t + 0.3, { gain: 0.18 });
	},
	double: (s, t) => {
		s.blip(C.C5, t);
		s.blip(C.C6, t + 0.1);
	},
	slowGrab: (s, t) => {
		s.marimba(C.C4, t, { gain: 0.45 });
		s.tone(600, t + 0.05, { dur: 0.4, gain: 0.15, to: 250 });
	},
	slowed: (s, t) => {
		for (let i = 0; i < 6; i++) {
			s.blip(600 - i * 60, t + i * 0.06, { gain: 0.32, dur: 0.07, to: 560 - i * 60 });
		}
	},
	bump: (s, t) =>
		s.stepTone(
			t,
			[
				[220, 0],
				[360, 0.035],
				[270, 0.07],
				[320, 0.1],
			],
			{ dur: 0.23, gain: 0.28, slide: 0.02 },
		),
	dash: (s, t) =>
		s.noise(t, { type: 'lowpass', freq: 400, to: 3000, q: 0.7, gain: 0.9, dur: 0.1, attack: 0.05 }),
	roundStart: (s, t) =>
		s.stepTone(
			t,
			[
				[C.C6, 0],
				[C.E6, 0.07],
				[C.G6, 0.14],
				[C.C7, 0.21],
			],
			{ dur: 0.6, slide: 0.01, attack: 0.012, gain: 0.26 },
		),
	tick: (s, t) => s.glass(C.G6, t, { gain: 0.4, dur: 0.15 }),
	lastTick: (s, t) =>
		s.stepTone(
			t,
			[
				[C.G6, 0],
				[C.C7, 0.05],
			],
			{ dur: 0.3, slide: 0.008, attack: 0.01 },
		),
	roundOver: (s, t) => [C.G5, C.E5, C.C5].forEach((f, i) => s.marimba(f, t + i * 0.12)),
	win: (s, t) => {
		[C.G4, C.C5, C.E5].forEach((f, i) => s.marimba(f, t + i * 0.1));
		[C.C5, C.G5, C.C6].forEach((f) => s.marimba(f, t + 0.35, { dur: 0.9, gain: 0.2 }));
	},
	personalBest: (s, t) =>
		[C.C6, C.E6, C.G6, C.C7].forEach((f, i) => s.glass(f, t + i * 0.08, { gain: 0.16, dur: 0.6 })),
};
