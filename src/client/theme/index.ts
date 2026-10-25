import { classicTheme } from './classic/index.js';
import { ninjaTheme } from './ninja/index.js';
import type { ThemeId } from './registry.js';
import type { Theme } from './types.js';

/** Theme implementations by id (browser only: themes may build canvas art on load). */
export const THEMES: Record<ThemeId, Theme> = {
	ninja: ninjaTheme,
	classic: classicTheme,
};
