import type { InputState } from '../shared/protocol.js';

type Direction = keyof InputState;

const KEY_MAP: Record<string, Direction> = {
	w: 'up',
	s: 'down',
	a: 'left',
	d: 'right',
	arrowup: 'up',
	arrowdown: 'down',
	arrowleft: 'left',
	arrowright: 'right',
};

/** True for form fields, so typing a name or picking a theme does not move the player. */
export function isTextField(target: unknown): boolean {
	const tag = (target as { tagName?: unknown } | null)?.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Tracks held direction keys (WASD and arrows); everything is released on blur. */
export class Keyboard {
	private readonly held = new Set<string>();

	constructor(target: EventTarget) {
		target.addEventListener('keydown', (e) => this.onKey(e as KeyboardEvent, true));
		target.addEventListener('keyup', (e) => this.onKey(e as KeyboardEvent, false));
		target.addEventListener('blur', () => this.held.clear());
	}

	get state(): InputState {
		const state: InputState = { up: false, down: false, left: false, right: false };
		for (const k of this.held) {
			state[KEY_MAP[k]!] = true;
		}
		return state;
	}

	private onKey(event: KeyboardEvent, down: boolean): void {
		const k = event.key.toLowerCase();
		if (!(k in KEY_MAP) || (down && isTextField(event.target))) {
			return;
		}
		if (k.startsWith('arrow')) {
			event.preventDefault();
		}
		if (down) {
			this.held.add(k);
		} else {
			this.held.delete(k);
		}
	}
}
