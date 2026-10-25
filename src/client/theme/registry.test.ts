import { expect, test } from 'vitest';
import { DEFAULT_THEME_ID, THEME_OPTIONS, isThemeId } from './registry.js';

test('offers Ninja and Classic, with Ninja as the default', () => {
	expect(THEME_OPTIONS.map((t) => t.id)).toEqual(['ninja', 'classic']);
	expect(THEME_OPTIONS.map((t) => t.label)).toEqual(['Ninja', 'Classic']);
	expect(DEFAULT_THEME_ID).toBe('ninja');
});

test('isThemeId accepts known ids only', () => {
	expect(isThemeId('classic')).toBe(true);
	expect(isThemeId('flat')).toBe(false);
	expect(isThemeId(null)).toBe(false);
});
