import type { SoundCue } from './cues.js';
import { Synth } from './synth.js';

/** A theme's sounds; cues it leaves out stay silent. */
export type SoundSet = Partial<Record<SoundCue, (synth: Synth, t: number) => void>>;

/** Seconds to wait before a cue, so it follows the sound it is played with. */
const CUE_DELAY: Partial<Record<SoundCue, number>> = { personalBest: 1.1 };

/** Small scheduling margin so a sound never starts in the past. */
const LEAD = 0.02;

/** Where sounds go; in the browser, a Synth on an AudioContext. */
export interface AudioOutput {
	readonly synth: Synth;
	readonly running: boolean;
	resume(): void;
	/** Start fetching sound files so they are ready when first played. */
	preload(urls: readonly string[]): void;
}

/**
 * Plays cues through the current theme's sounds. Browsers only allow audio after a user
 * gesture, so the output is opened lazily by `unlock`, which input handlers call.
 */
export class SoundBoard {
	private output: AudioOutput | null = null;

	constructor(
		private on: boolean,
		private readonly open: () => AudioOutput,
	) {}

	get enabled(): boolean {
		return this.on;
	}

	setEnabled(on: boolean): void {
		this.on = on;
		this.unlock();
	}

	/** Open or resume audio, and preload `files`; call from a click, tap or key press. */
	unlock(files: readonly string[] = []): void {
		if (!this.on) {
			return;
		}
		this.output ??= this.open();
		this.output.resume();
		this.output.preload(files);
	}

	play(cues: readonly SoundCue[], sounds: SoundSet | undefined): void {
		const output = this.output;
		if (!this.on || !output?.running || !sounds) {
			return;
		}
		const t = output.synth.now + LEAD;
		for (const cue of cues) {
			sounds[cue]?.(output.synth, t + (CUE_DELAY[cue] ?? 0));
		}
	}
}

/** The real output: one AudioContext for the page. */
export function browserAudio(): AudioOutput {
	const ctx = new AudioContext();
	const synth = new Synth(ctx);
	return {
		synth,
		get running() {
			return ctx.state === 'running';
		},
		resume: () => void ctx.resume(),
		preload: (urls) => synth.preload(urls),
	};
}
