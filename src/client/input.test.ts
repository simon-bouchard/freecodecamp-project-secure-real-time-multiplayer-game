import { expect, test } from 'vitest';
import { NO_INPUT } from '../shared/game.js';
import { Keyboard } from './input.js';

function key(type: 'keydown' | 'keyup', k: string): Event {
	return Object.assign(new Event(type, { cancelable: true }), { key: k });
}

test('w and ArrowUp both set up', () => {
	const target = new EventTarget();
	const kb = new Keyboard(target);
	target.dispatchEvent(key('keydown', 'w'));
	expect(kb.state.up).toBe(true);
	target.dispatchEvent(key('keyup', 'w'));
	target.dispatchEvent(key('keydown', 'ArrowUp'));
	expect(kb.state.up).toBe(true);
});

test('uppercase W works', () => {
	const target = new EventTarget();
	const kb = new Keyboard(target);
	target.dispatchEvent(key('keydown', 'W'));
	expect(kb.state.up).toBe(true);
});

test('keyup clears', () => {
	const target = new EventTarget();
	const kb = new Keyboard(target);
	target.dispatchEvent(key('keydown', 'd'));
	target.dispatchEvent(key('keyup', 'D'));
	expect(kb.state).toEqual(NO_INPUT);
});

test('blur clears all keys while held', () => {
	const target = new EventTarget();
	const kb = new Keyboard(target);
	target.dispatchEvent(key('keydown', 'a'));
	target.dispatchEvent(key('keydown', 'ArrowDown'));
	target.dispatchEvent(new Event('blur'));
	expect(kb.state).toEqual(NO_INPUT);
});

test('arrow keys do not scroll the page', () => {
	const target = new EventTarget();
	new Keyboard(target);
	const event = key('keydown', 'ArrowDown');
	target.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
});
