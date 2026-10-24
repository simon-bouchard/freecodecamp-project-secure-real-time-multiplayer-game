import { io } from 'socket.io-client';
import type { JoinFailure } from '../shared/protocol.js';
import { Keyboard } from './input.js';
import { drawFrame } from './render.js';
import { type GameSocket, GameSession } from './session.js';
import { loadProfile, saveProfile } from './storage.js';
import { JoinPanel, Scoreboard } from './ui.js';

const JOIN_MESSAGES: Record<JoinFailure, string> = {
	'color-taken': 'That colour was just taken',
	full: 'Game is full',
	invalid: 'Pick a name (1-12 characters)',
};

const canvas = document.getElementById('game-window') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const storage = (() => {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
})();

const socket: GameSocket = io();
const keyboard = new Keyboard(window);
const scoreboard = new Scoreboard(document.getElementById('scoreboard')!);
const panel = new JoinPanel(document.getElementById('join-panel') as HTMLFormElement, join);
const session = new GameSession(
	socket,
	() => keyboard.state,
	() => panel.show('Your colour was taken while you were disconnected'),
);

async function join(name: string, color: string): Promise<void> {
	const res = await session.join(name, color);
	if (res.ok) {
		panel.hide();
		saveProfile(storage, { name, color });
	} else {
		panel.show(JOIN_MESSAGES[res.reason]);
	}
}

const saved = loadProfile(storage);
if (saved) {
	panel.setProfile(saved);
}
panel.show();

function frame(now: number): void {
	session.update(now);
	const view = session.view(now);
	drawFrame(ctx, view);
	scoreboard.update(view.scoreboard);
	if (panel.visible) {
		panel.setTaken(new Set(view.scoreboard.map((row) => row.color)));
	}
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
