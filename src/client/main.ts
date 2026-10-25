import { io } from 'socket.io-client';
import type { JoinFailure } from '../shared/protocol.js';
import { fitCanvasToScreen } from './canvas.js';
import { Keyboard } from './input.js';
import { drawFrame } from './render.js';
import { type GameSocket, GameSession } from './session.js';
import { loadProfile, loadThemeId, saveProfile, saveThemeId } from './storage.js';
import { THEMES } from './theme/index.js';
import { THEME_OPTIONS, type ThemeId, isThemeId } from './theme/registry.js';
import { JoinPanel, Scoreboard } from './ui.js';

const JOIN_MESSAGES: Record<JoinFailure, string> = {
	'color-taken': 'That colour was just taken',
	full: 'Game is full',
	invalid: 'Pick a name (1-12 characters)',
	'unknown-color': 'This page is out of date. Please refresh.',
	timeout: "Couldn't reach the server, try again",
};

const canvas = document.getElementById('game-window') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
fitCanvasToScreen(canvas, ctx);
window.addEventListener('resize', () => fitCanvasToScreen(canvas, ctx));
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
	(reason) =>
		panel.show(
			reason === 'color-taken'
				? 'Your colour was taken while you were disconnected'
				: JOIN_MESSAGES[reason],
		),
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

const themeSelects = [...document.querySelectorAll<HTMLSelectElement>('.theme-select')];
let theme = THEMES[loadThemeId(storage)];

/** Switch the theme everywhere: canvas art, page styling, join panel wording, both dropdowns. */
function applyTheme(id: ThemeId): void {
	theme = THEMES[id];
	document.body.classList.remove(...Object.values(THEMES).map((t) => t.bodyClass));
	document.body.classList.add(theme.bodyClass);
	document.getElementById('join-name-label')!.textContent = theme.joinNameLabel;
	document.getElementById('join-hint')!.textContent = theme.joinHint;
	for (const select of themeSelects) {
		select.value = id;
	}
}

for (const select of themeSelects) {
	select.append(...THEME_OPTIONS.map((t) => new Option(t.label, t.id)));
	select.addEventListener('change', () => {
		if (isThemeId(select.value)) {
			applyTheme(select.value);
			saveThemeId(storage, select.value);
		}
		select.blur();
	});
}
applyTheme(theme.id);

const saved = loadProfile(storage);
if (saved) {
	panel.setProfile(saved);
}
panel.show();

function frame(now: number): void {
	session.update(now);
	const view = session.view(now);
	drawFrame(ctx, view, theme, now);
	scoreboard.update(view.scoreboard);
	if (panel.visible) {
		panel.setTaken(new Map(view.scoreboard.map((row) => [row.color, row.name])));
	}
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
