import type { GameEvent, LeaderboardView, RoundPhase, Snapshot } from '../../shared/protocol.js';

/** Every moment the game can play a sound for; each theme maps these to its own sounds. */
export const SOUND_CUES = [
	'coin',
	'ramen',
	'speed',
	'magnet',
	'double',
	'slowGrab',
	'slowed',
	'bump',
	'dash',
	'roundStart',
	'tick',
	'lastTick',
	'roundOver',
	'win',
	'personalBest',
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

/** The countdown ticks during the last this-many seconds of a round. */
const COUNTDOWN_SECONDS = 5;
/** A chase can bump every tick; the bump sound plays at most this often (server ms). */
const BUMP_GAP_MS = 150;

/**
 * Turns the snapshot and leaderboard streams into sound cues. Only changes seen while connected
 * count, so joining mid-round or reconnecting never replays what already happened.
 */
export class CueTracker {
	private phase: RoundPhase | null = null;
	private secondsLeft: number | null = null;
	/** The round-end leaderboard named us before the results snapshot arrived. */
	private bestBeforeResults = false;
	/** Results started this session; a leaderboard naming us now is a fresh best. */
	private awaitingBest = false;
	private lastBumpAt = -Infinity;

	snapshot(snapshot: Snapshot, selfId: string | null): SoundCue[] {
		const cues = this.pickupCues(snapshot, selfId);
		const { phase, endsAt, winners } = snapshot.round;
		const previous = this.phase;
		this.phase = phase;

		if (previous === 'playing' && phase === 'results') {
			cues.push(selfId !== null && winners.includes(selfId) ? 'win' : 'roundOver');
			if (this.bestBeforeResults) {
				cues.push('personalBest');
			} else {
				this.awaitingBest = selfId !== null;
			}
			this.bestBeforeResults = false;
		} else if (previous !== null && previous !== 'playing' && phase === 'playing') {
			cues.push('roundStart');
			this.awaitingBest = false;
			this.bestBeforeResults = false;
		}

		const seconds =
			phase === 'playing' && endsAt !== null ? Math.ceil((endsAt - snapshot.time) / 1000) : null;
		if (
			seconds !== null &&
			this.secondsLeft !== null &&
			seconds !== this.secondsLeft &&
			seconds >= 1 &&
			seconds <= COUNTDOWN_SECONDS
		) {
			cues.push(seconds === 1 ? 'lastTick' : 'tick');
		}
		this.secondsLeft = seconds;
		return cues;
	}

	leaderboard(view: LeaderboardView, selfId: string | null): SoundCue[] {
		if (selfId === null || !view.highlights.some((h) => h.playerId === selfId)) {
			return [];
		}
		if (this.awaitingBest) {
			this.awaitingBest = false;
			return ['personalBest'];
		}
		if (this.phase === 'playing') {
			this.bestBeforeResults = true;
		}
		return [];
	}

	/** Forget everything, e.g. after a disconnect. */
	reset(): void {
		this.phase = null;
		this.secondsLeft = null;
		this.bestBeforeResults = false;
		this.awaitingBest = false;
		this.lastBumpAt = -Infinity;
	}

	private pickupCues({ events, players, time }: Snapshot, selfId: string | null): SoundCue[] {
		if (selfId === null) {
			return [];
		}
		const playing = players.some((p) => p.id === selfId);
		return events.flatMap((event): SoundCue[] => {
			if (event.kind === 'bump') {
				const mine = event.playerId === selfId || event.otherId === selfId;
				if (!mine || time - this.lastBumpAt < BUMP_GAP_MS) {
					return [];
				}
				this.lastBumpAt = time;
				return ['bump'];
			}
			if (event.playerId !== selfId) {
				return playing && isSlow(event) ? ['slowed'] : [];
			}
			if (event.kind === 'coin') {
				return ['coin'];
			}
			if (event.kind === 'bigCoin') {
				return ['ramen'];
			}
			return [event.item === 'slow' ? 'slowGrab' : event.item];
		});
	}
}

function isSlow(event: GameEvent): boolean {
	return event.kind === 'item' && event.item === 'slow';
}
