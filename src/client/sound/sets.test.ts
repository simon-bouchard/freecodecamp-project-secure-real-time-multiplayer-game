import { expect, test } from 'vitest';
import { SOUND_CUES } from './cues.js';
import { flatSounds } from './flat.js';
import { ninjaSounds } from './ninja.js';

test.each([
	['ninja', ninjaSounds],
	['flat', flatSounds],
])('the %s theme has a sound for every cue', (_, sounds) => {
	expect(Object.keys(sounds).sort()).toEqual([...SOUND_CUES].sort());
});
