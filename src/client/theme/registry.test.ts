import { expect, test } from 'vitest';
import { DEFAULT_THEME_ID, THEME_OPTIONS, isThemeId } from './registry.js';

test('offers Ninja, Classic and Flat, with Ninja as the default', () => {
	expect(THEME_OPTIONS.map((t) => t.id)).toEqual(['ninja', 'classic', 'flat']);
	expect(THEME_OPTIONS.map((t) => t.label)).toEqual(['Ninja', 'Classic', 'Flat']);
	expect(DEFAULT_THEME_ID).toBe('ninja');
});

test('isThemeId accepts known ids only', () => {
	expect(isThemeId('classic')).toBe(true);
	expect(isThemeId('flat')).toBe(true);
	expect(isThemeId('vaporwave')).toBe(false);
	expect(isThemeId(null)).toBe(false);
});
