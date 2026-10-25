/** A stereo sweep: start and end pan (-1 left to 1 right) over `seconds`. */
type Pan = readonly [from: number, to: number, seconds: number];

interface ToneOptions {
	type?: OscillatorType;
	dur?: number;
	gain?: number;
	attack?: number;
	/** Glide the pitch to this frequency... */
	to?: number;
	/** ...over this many seconds (default: the whole sound). */
	glide?: number;
}

interface NoiseOptions {
	type?: BiquadFilterType;
	freq?: number;
	q?: number;
	gain?: number;
	dur?: number;
	attack?: number;
	/** Sweep the filter to this frequency over the sound. */
	to?: number;
	pan?: Pan;
}

/**
 * Small instrument kit built on Web Audio: every sound is generated, nothing is downloaded.
 * Times are in AudioContext seconds; sounds schedule themselves and clean up when done.
 */
export class Synth {
	private readonly master: GainNode;
	private readonly noiseBuffer: AudioBuffer;
	private readonly strings = new Map<string, AudioBuffer>();
	private sawari: Float32Array<ArrayBuffer> | null = null;

	constructor(readonly ctx: BaseAudioContext) {
		this.master = ctx.createGain();
		this.master.gain.value = 0.7;
		const limiter = ctx.createDynamicsCompressor();
		this.master.connect(limiter).connect(ctx.destination);
		this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
		const data = this.noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = Math.random() * 2 - 1;
		}
	}

	get now(): number {
		return this.ctx.currentTime;
	}

	tone(
		freq: number,
		t: number,
		{ type = 'sine', dur = 0.3, gain = 0.3, attack = 0.005, to, glide }: ToneOptions = {},
	): void {
		const o = this.ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		if (to) {
			o.frequency.exponentialRampToValueAtTime(to, t + (glide ?? attack + dur));
		}
		const g = this.ctx.createGain();
		envelope(g, t, attack, gain, dur);
		o.connect(g).connect(this.master);
		o.start(t);
		o.stop(t + attack + dur + 0.05);
	}

	noise(
		t: number,
		{
			type = 'bandpass',
			freq = 1000,
			q = 1,
			gain = 0.5,
			dur = 0.1,
			attack = 0.002,
			to,
			pan,
		}: NoiseOptions = {},
	): void {
		const s = this.noiseSource();
		const f = this.ctx.createBiquadFilter();
		f.type = type;
		f.Q.value = q;
		f.frequency.setValueAtTime(freq, t);
		if (to) {
			f.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
		}
		const g = this.ctx.createGain();
		envelope(g, t, attack, gain, dur);
		this.out(s.connect(f).connect(g), t, pan);
		s.start(t, Math.random() * 1.5);
		s.stop(t + attack + dur + 0.05);
	}

	/** Koto: a clean plucked string. */
	koto(freq: number, t: number, { gain = 0.55, dur = 1.8 } = {}): void {
		const s = this.ctx.createBufferSource();
		s.buffer = this.string(freq, dur, 0.997, 0.75);
		const g = this.ctx.createGain();
		g.gain.value = gain;
		s.connect(g).connect(this.master);
		s.start(t);
		this.noise(t, { freq: 4000, q: 1.5, gain: gain * 0.06, dur: 0.012 });
	}

	/** Shamisen: bright string, buzzy sawari and the slap of the bachi plectrum. */
	shamisen(freq: number, t: number, { gain = 0.5, dur = 0.9 } = {}): void {
		const s = this.ctx.createBufferSource();
		s.buffer = this.string(freq, dur, 0.994, 0.95);
		const drive = this.ctx.createGain();
		drive.gain.value = 2.5;
		const buzz = this.ctx.createWaveShaper();
		buzz.curve = this.sawariCurve();
		const body = this.ctx.createBiquadFilter();
		body.type = 'peaking';
		body.frequency.value = 2500;
		body.Q.value = 1.2;
		body.gain.value = 6;
		const low = this.ctx.createBiquadFilter();
		low.type = 'highpass';
		low.frequency.value = 180;
		const g = this.ctx.createGain();
		g.gain.value = gain * 0.5;
		s.connect(drive).connect(buzz).connect(body).connect(low).connect(g).connect(this.master);
		s.start(t);
		this.noise(t, { freq: 2200, q: 2, gain: gain * 0.5, dur: 0.012 });
		this.noise(t, { type: 'lowpass', freq: 400, gain: gain * 0.3, dur: 0.03 });
	}

	/** Taiko: membrane modes with a quick pitch drop, a skin slap and a body thump. */
	taiko(t: number, { freq = 60, gain = 0.9, dur = 0.8 } = {}): void {
		const modes = [
			[1, 1, 1],
			[1.59, 0.4, 0.45],
			[2.14, 0.25, 0.3],
			[2.65, 0.15, 0.2],
		] as const;
		for (const [ratio, amp, life] of modes) {
			this.tone(freq * ratio * 1.5, t, {
				dur: dur * life,
				gain: gain * amp,
				attack: 0.002,
				to: freq * ratio,
				glide: 0.06,
			});
		}
		this.noise(t, { type: 'lowpass', freq: 1500, to: 250, q: 0.7, gain: gain * 0.45, dur: 0.07 });
		this.noise(t, { freq: 140, q: 1.2, gain: gain * 0.35, dur: dur * 0.5 });
	}

	/** Taiko rim hit ("ka"): a dry click off the drum's edge. */
	taikoRim(t: number, gain = 0.5): void {
		this.noise(t, { freq: 1900, q: 4, gain, dur: 0.035 });
		this.tone(780, t, { type: 'triangle', dur: 0.04, gain: gain * 0.6, attack: 0.001, to: 650 });
	}

	/** Hyoshigi: two hardwood blocks struck together. */
	clack(t: number, { freq = 2200, gain = 0.6 } = {}): void {
		this.noise(t, { freq, q: 9, gain, dur: 0.05 });
		this.tone(freq * 0.55, t, { type: 'triangle', dur: 0.04, gain: gain * 0.5 });
	}

	woodBlock(t: number, freq = 900, gain = 0.45): void {
		this.tone(freq, t, { type: 'triangle', dur: 0.06, gain, attack: 0.002, to: freq * 0.9 });
		this.noise(t, { freq: freq * 2.5, q: 6, gain: gain * 0.4, dur: 0.02 });
	}

	/** Rin bowl: inharmonic partials, each a slightly detuned pair so it shimmers. */
	rin(freq: number, t: number, { gain = 0.2, dur = 2.5 } = {}): void {
		const partials = [
			[1, 1],
			[2.71, 0.45],
			[5.15, 0.2],
			[8.43, 0.08],
		] as const;
		partials.forEach(([ratio, amp], i) => {
			for (const detune of [1, 1 + 3 / (freq * ratio)]) {
				this.tone(freq * ratio * detune, t, {
					dur: dur / (1 + i * 1.2),
					gain: gain * amp * 0.6,
					attack: 0.002,
				});
			}
		});
		this.noise(t, { type: 'highpass', freq: 5000, gain: gain * 0.15, dur: 0.01 });
	}

	/** Gong: beating modes; the higher ones bloom after the strike. */
	gong(freq: number, t: number, { gain = 0.5, dur = 5, bloom = 0.6 } = {}): void {
		const modes = [
			[1, 1, 1],
			[1.47, 0.55, 0.85],
			[1.94, 0.5, 0.7],
			[2.43, 0.4, 0.6],
			[2.91, 0.32, 0.5],
			[3.52, 0.26, 0.45],
			[4.17, 0.2, 0.35],
			[5.03, 0.15, 0.3],
			[6.11, 0.1, 0.25],
			[7.4, 0.07, 0.2],
		] as const;
		modes.forEach(([ratio, amp, life], i) => {
			const attack = i < 2 ? 0.006 : bloom * (i / modes.length);
			for (const detune of [1, 1.0023]) {
				const f = freq * ratio * detune;
				const o = this.ctx.createOscillator();
				o.frequency.setValueAtTime(f * 1.012, t);
				o.frequency.exponentialRampToValueAtTime(f, t + 0.5);
				const g = this.ctx.createGain();
				envelope(g, t, attack, gain * amp * 0.45, dur * life);
				o.connect(g).connect(this.master);
				o.start(t);
				o.stop(t + attack + dur * life + 0.1);
			}
		});
		this.noise(t, { type: 'lowpass', freq: 250, q: 0.7, gain: gain * 0.7, dur: 0.18 });
		this.noise(t, { freq: freq * 9, q: 0.8, gain: gain * 0.05, dur: dur * 0.4, attack: bloom });
	}

	/** Shakuhachi: pitched air over a soft body tone, with a breathy chiff and vibrato. */
	shakuhachi(
		freq: number,
		t: number,
		{ dur = 0.6, gain = 0.3, to }: { dur?: number; gain?: number; to?: number } = {},
	): void {
		const end = t + dur;
		const shape = (g: GainNode, peak: number) => {
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(peak, t + 0.07);
			g.gain.setValueAtTime(peak, end - dur * 0.3);
			g.gain.exponentialRampToValueAtTime(0.0001, end);
		};
		const vibrato = this.ctx.createOscillator();
		vibrato.frequency.value = 5;
		const depth = this.ctx.createGain();
		depth.gain.setValueAtTime(0, t);
		depth.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.7);
		vibrato.connect(depth);

		const body = this.ctx.createOscillator();
		body.type = 'triangle';
		body.frequency.setValueAtTime(freq, t);
		if (to) {
			body.frequency.exponentialRampToValueAtTime(to, end);
		}
		depth.connect(body.frequency);
		const bodyGain = this.ctx.createGain();
		shape(bodyGain, gain * 0.35);
		const soften = this.ctx.createBiquadFilter();
		soften.type = 'lowpass';
		soften.frequency.value = freq * 3;
		body.connect(soften).connect(bodyGain).connect(this.master);

		const air = this.noiseSource();
		const band = this.ctx.createBiquadFilter();
		band.type = 'bandpass';
		band.Q.value = 30;
		band.frequency.setValueAtTime(freq, t);
		if (to) {
			band.frequency.exponentialRampToValueAtTime(to, end);
		}
		depth.connect(band.frequency);
		const airGain = this.ctx.createGain();
		shape(airGain, gain * 5);
		air.connect(band).connect(airGain).connect(this.master);

		this.noise(t, {
			type: 'highpass',
			freq: 2500,
			gain: gain * 0.12,
			dur: dur * 0.9,
			attack: 0.05,
		});
		this.noise(t, { freq: freq * 3, q: 3, gain: gain * 0.4, dur: 0.05 });

		for (const node of [vibrato, body]) {
			node.start(t);
			node.stop(end + 0.05);
		}
		air.start(t, Math.random() * 1.5);
		air.stop(end + 0.05);
	}

	/** A soft sine blip with a tiny pitch lift. */
	blip(
		freq: number,
		t: number,
		{ dur = 0.12, gain = 0.3, to }: { dur?: number; gain?: number; to?: number } = {},
	): void {
		this.tone(freq, t, { dur, gain, attack: 0.004, to: to ?? freq * 1.06, glide: 0.05 });
	}

	/** Marimba: a woody fundamental plus its quick upper partials. */
	marimba(freq: number, t: number, { gain = 0.35, dur = 0.5 } = {}): void {
		this.tone(freq, t, { dur, gain, attack: 0.002 });
		this.tone(freq * 3.93, t, { dur: dur * 0.25, gain: gain * 0.25, attack: 0.001 });
		this.tone(freq * 9.2, t, { dur: dur * 0.08, gain: gain * 0.1, attack: 0.001 });
	}

	/** Glassy chime: a clear tone with one bright partial. */
	glass(freq: number, t: number, { gain = 0.15, dur = 0.8 } = {}): void {
		this.tone(freq, t, { dur, gain, attack: 0.003 });
		this.tone(freq * 2.76, t, { dur: dur * 0.4, gain: gain * 0.35, attack: 0.002 });
	}

	/**
	 * One continuous tone under a single envelope whose pitch steps through `notes`
	 * ([frequency, seconds after t]), sliding into each over `slide` seconds.
	 */
	stepTone(
		t: number,
		notes: readonly (readonly [number, number])[],
		{ dur = 0.17, gain = 0.28, slide = 0, attack = 0.004 } = {},
	): void {
		const o = this.ctx.createOscillator();
		let prev = notes[0]![0];
		o.frequency.setValueAtTime(prev, t);
		for (const [freq, at] of notes.slice(1)) {
			if (slide > 0) {
				o.frequency.setValueAtTime(prev, t + at - slide);
				o.frequency.exponentialRampToValueAtTime(freq, t + at);
			} else {
				o.frequency.setValueAtTime(freq, t + at);
			}
			prev = freq;
		}
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(gain, t + attack);
		g.gain.setValueAtTime(gain, t + notes.at(-1)![1]);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		o.connect(g).connect(this.master);
		o.start(t);
		o.stop(t + dur + 0.05);
	}

	/** A puff of smoke with a dropping thump. */
	poof(t: number, gain = 0.6): void {
		this.noise(t, { type: 'lowpass', freq: 3000, to: 200, q: 0.5, gain, dur: 0.4, attack: 0.01 });
		this.tone(180, t, { type: 'triangle', dur: 0.3, gain: gain * 0.4, to: 60 });
	}

	/** A spinning blade passing left to right: a swoosh chopped by a fast flutter. */
	spinner(t: number, { dur = 0.5, rate = 26, gain = 0.7 } = {}): void {
		const s = this.noiseSource();
		const f = this.ctx.createBiquadFilter();
		f.type = 'bandpass';
		f.Q.value = 2.5;
		f.frequency.setValueAtTime(1800, t);
		f.frequency.exponentialRampToValueAtTime(4200, t + dur * 0.5);
		f.frequency.exponentialRampToValueAtTime(2200, t + dur);
		const chop = this.ctx.createGain();
		chop.gain.value = 0.5;
		const lfo = this.ctx.createOscillator();
		lfo.frequency.setValueAtTime(rate, t);
		lfo.frequency.linearRampToValueAtTime(rate * 0.7, t + dur);
		const lfoDepth = this.ctx.createGain();
		lfoDepth.gain.value = 0.5;
		lfo.connect(lfoDepth).connect(chop.gain);
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		this.out(s.connect(f).connect(chop).connect(g), t, [-0.7, 0.7, dur]);
		for (const node of [s, lfo]) {
			node.start(t);
			node.stop(t + dur + 0.05);
		}
	}

	private noiseSource(): AudioBufferSourceNode {
		const s = this.ctx.createBufferSource();
		s.buffer = this.noiseBuffer;
		return s;
	}

	private out(node: AudioNode, t: number, pan?: Pan): void {
		if (!pan) {
			node.connect(this.master);
			return;
		}
		const p = this.ctx.createStereoPanner();
		p.pan.setValueAtTime(pan[0], t);
		p.pan.linearRampToValueAtTime(pan[1], t + pan[2]);
		node.connect(p).connect(this.master);
	}

	/** Karplus-Strong plucked string, rendered once per pitch and kept. */
	private string(freq: number, dur: number, decay: number, bright: number): AudioBuffer {
		const key = `${freq}|${dur}|${decay}|${bright}`;
		const cached = this.strings.get(key);
		if (cached) {
			return cached;
		}
		const sr = this.ctx.sampleRate;
		const n = Math.floor(sr * dur);
		const buf = this.ctx.createBuffer(1, n, sr);
		const y = buf.getChannelData(0);
		const period = Math.max(2, Math.round(sr / freq - 0.5));
		let smooth = 0;
		let mean = 0;
		for (let i = 0; i < period; i++) {
			smooth = bright * (Math.random() * 2 - 1) + (1 - bright) * smooth;
			y[i] = smooth;
			mean += smooth / period;
		}
		for (let i = 0; i < period; i++) {
			y[i]! -= mean;
		}
		for (let i = period; i < n; i++) {
			y[i] = decay * 0.5 * (y[i - period]! + y[i - period - 1 >= 0 ? i - period - 1 : 0]!);
		}
		const fade = Math.floor(sr * 0.03);
		for (let i = 0; i < fade; i++) {
			y[n - 1 - i]! *= i / fade;
		}
		this.strings.set(key, buf);
		return buf;
	}

	private sawariCurve(): Float32Array<ArrayBuffer> {
		if (!this.sawari) {
			this.sawari = new Float32Array(2048);
			for (let i = 0; i < this.sawari.length; i++) {
				const x = (i / (this.sawari.length - 1)) * 2 - 1;
				this.sawari[i] = Math.tanh(2 * x) + 0.15 * Math.sin(9 * x);
			}
		}
		return this.sawari;
	}
}

function envelope(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
