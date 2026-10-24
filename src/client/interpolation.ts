import { SNAPSHOT_BUFFER_MS } from '../shared/constants.js';
import type { Snapshot, Vec } from '../shared/protocol.js';

interface Entry {
	snapshot: Snapshot;
	receivedAt: number;
}

/** Recent server snapshots, sampled at a past server time to draw smooth movement. */
export class SnapshotBuffer {
	private entries: Entry[] = [];

	get size(): number {
		return this.entries.length;
	}

	push(snapshot: Snapshot, receivedAt: number): void {
		this.entries.push({ snapshot, receivedAt });
		const newest = snapshot.time;
		while (this.entries.length > 2 && newest - this.entries[0]!.snapshot.time > SNAPSHOT_BUFFER_MS) {
			this.entries.shift();
		}
	}

	latest(): Snapshot | undefined {
		return this.entries.at(-1)?.snapshot;
	}

	clear(): void {
		this.entries = [];
	}

	/** Estimate the server clock at local time `now`, using the least-delayed recent snapshot. */
	serverTimeAt(now: number): number {
		if (this.entries.length === 0) {
			return now;
		}
		const offset = Math.min(...this.entries.map((e) => e.receivedAt - e.snapshot.time));
		return now - offset;
	}

	/** Player positions at server time `renderTime`, interpolated between surrounding snapshots. */
	sample(renderTime: number): Map<string, Vec> {
		const result = new Map<string, Vec>();
		const first = this.entries[0]?.snapshot;
		const last = this.entries.at(-1)?.snapshot;
		if (!first || !last) {
			return result;
		}

		const nextIndex = this.entries.findIndex((e) => e.snapshot.time > renderTime);
		if (renderTime <= first.time || nextIndex <= 0) {
			const only = renderTime <= first.time ? first : last;
			only.players.forEach((p) => result.set(p.id, { x: p.x, y: p.y }));
			return result;
		}

		const a = this.entries[nextIndex - 1]!.snapshot;
		const b = this.entries[nextIndex]!.snapshot;
		const t = (renderTime - a.time) / (b.time - a.time);
		const before = new Map(a.players.map((p) => [p.id, p]));
		for (const p of b.players) {
			const prev = before.get(p.id);
			result.set(
				p.id,
				prev ? { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t } : { x: p.x, y: p.y },
			);
		}
		return result;
	}
}
