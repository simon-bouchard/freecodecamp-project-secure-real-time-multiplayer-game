import { PALETTE } from '../shared/constants.js';
import { isPlayerKey } from '../shared/game.js';
import { type MapChoice, isMapChoice } from '../shared/maps.js';
import type { Period } from '../shared/protocol.js';
import { DEFAULT_THEME_ID, type ThemeId, isThemeId } from './theme/registry.js';

const KEY = 'coin-race-profile';
const THEME_KEY = 'coin-race-theme';
const PLAYER_KEY = 'coin-race-player-key';
const SOUND_KEY = 'coin-race-sound';
const MAP_KEY = 'coin-race-map';

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

/** The map last picked on the start screen; Random until the player picks one. */
export function loadMapPick(storage: Storage | null): MapChoice {
	try {
		const value = storage?.getItem(MAP_KEY);
		return isMapChoice(value) ? value : 'random';
	} catch {
		return 'random';
	}
}

export function saveMapPick(storage: Storage | null, choice: MapChoice): void {
	try {
		storage?.setItem(MAP_KEY, choice);
	} catch {
		// Same as saveProfile: the choice just won't be remembered.
	}
}

/** Whether sound is on; on unless the player turned it off. */
export function loadSoundOn(storage: Storage | null): boolean {
	try {
		return storage?.getItem(SOUND_KEY) !== 'off';
	} catch {
		return true;
	}
}

export function saveSoundOn(storage: Storage | null, on: boolean): void {
	try {
		storage?.setItem(SOUND_KEY, on ? 'on' : 'off');
	} catch {
		// Same as saveProfile: the choice just won't be remembered.
	}
}

/**
 * This browser's secret leaderboard key, created on first use. Without working storage a fresh
 * key is returned each time, so runs just won't be linked across visits.
 */
export function loadOrCreatePlayerKey(
	storage: Storage | null,
	newKey: () => string = () => crypto.randomUUID(),
): string {
	try {
		const stored = storage?.getItem(PLAYER_KEY);
		if (isPlayerKey(stored)) {
			return stored;
		}
		const key = newKey();
		storage?.setItem(PLAYER_KEY, key);
		return key;
	} catch {
		return newKey();
	}
}

/** Which leaderboard the panel shows. */
export interface BoardPrefs {
	period: Period;
	scope: 'everyone' | 'mine';
}

const BOARD_KEY = 'coin-race-board';
const PERIODS: readonly Period[] = ['today', 'month', 'all'];

/** Saved panel choices; each invalid or missing field falls back to today / everyone. */
export function loadBoardPrefs(storage: Storage | null): BoardPrefs {
	const prefs: BoardPrefs = { period: 'today', scope: 'everyone' };
	try {
		const raw = storage?.getItem(BOARD_KEY);
		const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
		if (PERIODS.includes(saved.period as Period)) {
			prefs.period = saved.period as Period;
		}
		if (saved.scope === 'everyone' || saved.scope === 'mine') {
			prefs.scope = saved.scope;
		}
	} catch {
		// Corrupt or blocked storage: keep the defaults.
	}
	return prefs;
}

export function saveBoardPrefs(storage: Storage | null, prefs: BoardPrefs): void {
	try {
		storage?.setItem(BOARD_KEY, JSON.stringify(prefs));
	} catch {
		// The choice just won't be remembered.
	}
}
