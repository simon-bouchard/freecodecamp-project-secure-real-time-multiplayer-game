import type { SoundSet } from './board.js';

/** Japanese "yo" scale on D, the brighter of the two used on the sound test page. */
const YO = {
	D4: 293.66,
	E4: 329.63,
	G4: 392,
	A4: 440,
	B4: 493.88,
	D5: 587.33,
	E5: 659.26,
	G5: 783.99,
	A5: 880,
	B5: 987.77,
	D6: 1174.66,
};
const YO_STRINGS = [YO.D4, YO.E4, YO.G4, YO.A4, YO.B4, YO.D5, YO.E5, YO.G5, YO.A5, YO.B5, YO.D6];

/** Ninja sounds: koto, shamisen, shakuhachi, taiko, wood and bells. */
export const ninjaSounds: SoundSet = {
	coin: (s, t) => s.woodBlock(t, 1300, 0.5),
	ramen: (s, t) => {
		YO_STRINGS.forEach((f, i) => s.koto(f, t + i * 0.035, { gain: 0.4 }));
		s.koto(YO.D5, t + 0.5, { gain: 0.5 });
		s.koto(YO.D6, t + 0.5, { gain: 0.4 });
	},
	speed: (s, t) => s.spinner(t, { gain: 1.6 }),
	magnet: (s, t) => {
		s.noise(t, { freq: 400, to: 3500, q: 1.2, gain: 1.1, dur: 0.02, attack: 0.4 });
		s.rin(1568, t + 0.42, { gain: 0.14, dur: 1.4 });
	},
	double: (s, t) => {
		s.clonePop(t, -0.7);
		s.clonePop(t + 0.12, 0.7);
	},
	slowGrab: (s, t) => {
		s.taiko(t, { freq: 45, dur: 1.1 });
		s.poof(t + 0.05, 0.3);
	},
	slowed: (s, t) => {
		s.poof(t);
		s.tone(300, t, { type: 'triangle', dur: 0.5, gain: 0.15, to: 100 });
	},
	roundStart: (s, t) => {
		s.taiko(t, { gain: 0.6 });
		s.taiko(t + 0.25, { gain: 0.6 });
		s.taiko(t + 0.5, { freq: 50, gain: 1 });
		s.clack(t + 0.5);
	},
	tick: (s, t) => s.taikoRim(t, 0.9),
	lastTick: (s, t) => s.taiko(t, { gain: 0.8 }),
	roundOver: (s, t) => s.gong(220, t, { gain: 0.4, dur: 2.5, bloom: 0.2 }),
	win: (s, t) => {
		s.shakuhachi(YO.A4, t, { dur: 0.35 });
		s.shakuhachi(YO.B4, t + 0.35, { dur: 0.35 });
		s.shakuhachi(YO.D5, t + 0.7, { dur: 1.1 });
		s.taiko(t + 0.7);
	},
	personalBest: (s, t) => {
		[YO.D4, YO.E4, YO.G4, YO.A4, YO.B4, YO.D5].forEach((f, i) =>
			s.shamisen(f, t + i * 0.055, { dur: 0.3, gain: 0.4 }),
		);
		s.shamisen(YO.A4, t + 0.42, { gain: 0.5 });
		s.shamisen(YO.D5, t + 0.42, { gain: 0.5 });
	},
};
