/** Selectable themes, in menu order. Kept free of drawing code so it loads anywhere. */
export const THEME_OPTIONS = [
	{ id: 'ninja', label: 'Ninja' },
	{ id: 'classic', label: 'Classic' },
	{ id: 'flat', label: 'Flat' },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]['id'];

export const DEFAULT_THEME_ID: ThemeId = 'ninja';

export function isThemeId(value: unknown): value is ThemeId {
	return THEME_OPTIONS.some((t) => t.id === value);
}
