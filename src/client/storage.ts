import { PALETTE } from '../shared/constants.js';
import { DEFAULT_THEME_ID, type ThemeId, isThemeId } from './theme/registry.js';

const KEY = 'coin-race-profile';
const THEME_KEY = 'coin-race-theme';

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

/** Saved theme choice, or the default when missing, unknown or storage is unavailable. */
export function loadThemeId(storage: Storage | null): ThemeId {
	try {
		const value = storage?.getItem(THEME_KEY);
		return isThemeId(value) ? value : DEFAULT_THEME_ID;
	} catch {
		return DEFAULT_THEME_ID;
	}
}

export function saveThemeId(storage: Storage | null, id: ThemeId): void {
	try {
		storage?.setItem(THEME_KEY, id);
	} catch {
		// Same as saveProfile: the choice just won't be remembered.
	}
}
