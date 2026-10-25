import type { Vec } from '../../shared/protocol.js';

const PUFF_INTERVAL_MS = 60;
const PUFF_LIFETIME_MS = 450;
const MIN_MOVE = 2;

interface Puff {
	x: number;
	y: number;
	born: number;
}

interface Track {
	last: Vec;
	lastPuff: number;
	puffs: Puff[];
}

/** Fading puffs (smoke, ghost discs) left behind boosted players, tracked per player id. */
export class SmokeTrail {
	private readonly tracks = new Map<string, Track>();

	/** Record where a player is drawn this frame; boosted movement drops a puff now and then. */
	update(id: string, pos: Vec, boosted: boolean, now: number): void {
		let track = this.tracks.get(id);
		if (!track) {
			track = { last: { ...pos }, lastPuff: -Infinity, puffs: [] };
			this.tracks.set(id, track);
		}
		const moved = Math.hypot(pos.x - track.last.x, pos.y - track.last.y) >= MIN_MOVE;
		if (boosted && moved && now - track.lastPuff >= PUFF_INTERVAL_MS) {
			track.puffs.push({ x: track.last.x, y: track.last.y, born: now });
			track.lastPuff = now;
		}
		if (moved || !boosted) {
			track.last = { ...pos };
		}
		track.puffs = track.puffs.filter((p) => now - p.born < PUFF_LIFETIME_MS);
	}

	/** Live puffs for a player: they grow and fade with age. */
	puffs(id: string, now: number): { x: number; y: number; r: number; alpha: number }[] {
		const track = this.tracks.get(id);
		if (!track) {
			return [];
		}
		return track.puffs
			.filter((p) => now - p.born < PUFF_LIFETIME_MS)
			.map((p) => {
				const age = (now - p.born) / PUFF_LIFETIME_MS;
				return { x: p.x, y: p.y + 2, r: 5 + 5 * age, alpha: 0.45 * (1 - age) };
			});
	}

	/** Drop tracks for players no longer in the game. */
	forget(present: Set<string>): void {
		for (const id of this.tracks.keys()) {
			if (!present.has(id)) {
				this.tracks.delete(id);
			}
		}
	}
}
