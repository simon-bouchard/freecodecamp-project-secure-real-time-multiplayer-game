import { PALETTE } from '../shared/constants.js';

const KEY = 'coin-race-profile';

export interface SavedProfile {
	name: string;
	color: string;
}

/** Last used name and colour, or null if storage is missing, blocked or holds bad data. */
export function loadProfile(storage: Storage | null): SavedProfile | null {
	try {
		const raw = storage?.getItem(KEY);
		if (!raw) {
			return null;
		}
		const { name, color } = JSON.parse(raw) as Record<string, unknown>;
		if (typeof name !== 'string' || typeof color !== 'string' || !PALETTE.includes(color)) {
			return null;
		}
		return { name, color };
	} catch {
		return null;
	}
}

/** Remember the profile; silently does nothing when storage is unavailable. */
export function saveProfile(storage: Storage | null, profile: SavedProfile): void {
	try {
		storage?.setItem(KEY, JSON.stringify(profile));
	} catch {
		// Storage can be blocked (private mode, site data disabled); the game works without it.
	}
}
