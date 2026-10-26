import { io } from 'socket.io-client';
import { PLAYER_SPEED, TICK_DT } from '../shared/constants.js';
import { inputToMove } from '../shared/game.js';
import type { Move } from '../shared/protocol.js';
import type { JoinFailure } from '../shared/protocol.js';
import { fitCanvasToScreen, textScale } from './canvas.js';
import { Keyboard } from './input.js';
import { PointerSteering, moveToward, toGameCoords } from './steering.js';
import { drawFrame } from './render.js';
import { type GameSocket, GameSession } from './session.js';
import { SoundBoard, browserAudio } from './sound/board.js';
import { CueTracker } from './sound/cues.js';
import {
	loadBoardPrefs,
	loadOrCreatePlayerKey,
	loadProfile,
	loadSoundOn,
	loadThemeId,
	saveBoardPrefs,
	saveProfile,
	saveSoundOn,
	saveThemeId,
} from './storage.js';
import { THEMES } from './theme/index.js';
import { THEME_OPTIONS, type ThemeId, isThemeId } from './theme/registry.js';
import { BestRunsPanel, JoinPanel, MapCards, MapVoteOverlay, Scoreboard } from './ui.js';

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

const socket: GameSocket = io({ auth: { playerKey: loadOrCreatePlayerKey(storage) } });
/** Phones and tablets: show touch wording instead of keyboard hints. */
const touchScreen = window.matchMedia('(pointer: coarse)').matches;
const keyboard = new Keyboard(window);
const steering = new PointerSteering(canvas, (event) =>
	toGameCoords(event.clientX, event.clientY, canvas.getBoundingClientRect()),
);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

/** Start a dash if allowed; our own dash sound plays right away, without waiting for the server. */
function dash(): void {
	if (session.requestDash()) {
		sounds.play(['dash'], theme.sounds);
	}
}

/** Two presses on the game this close together (ms) are a double tap: dash. */
const DOUBLE_TAP_MS = 300;
let lastPress = -Infinity;
canvas.addEventListener('pointerdown', (event) => {
	if (event.timeStamp - lastPress < DOUBLE_TAP_MS) {
		dash();
	}
	lastPress = event.timeStamp;
});
window.addEventListener('keydown', (event) => {
	const typing =
		event.target instanceof HTMLElement && event.target.closest('input, select, button');
	if (event.code !== 'Space' || event.repeat || typing) {
		return;
	}
	event.preventDefault();
	dash();
});

/** Held keys win; otherwise walk toward the touch target from where we predict we are. */
function readMove(): Move {
	const keys = keyboard.state;
	if (keys.up || keys.down || keys.left || keys.right) {
		return inputToMove(keys);
	}
	const target = steering.target;
	const position = session.predictor.position;
	if (!target || !position) {
		return { x: 0, y: 0 };
	}
	return moveToward(position, target, PLAYER_SPEED * TICK_DT * session.predictor.nextStepFactor());
}
const scoreboard = new Scoreboard(document.getElementById('scoreboard')!);
const bestRuns = new BestRunsPanel(
	document.querySelector<HTMLElement>('.best-runs')!,
	loadBoardPrefs(storage),
	(prefs) => saveBoardPrefs(storage, prefs),
);
const panel = new JoinPanel(document.getElementById('join-panel') as HTMLFormElement, join);
const session = new GameSession(socket, readMove, (reason) =>
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

const mapVote = new MapVoteOverlay(document.getElementById('map-vote')!, (choice) =>
	session.vote(choice),
);
const mapPick = new MapCards(document.querySelector<HTMLElement>('.map-pick')!, (choice) =>
	session.preferMap(choice),
);

const themeSelects = [...document.querySelectorAll<HTMLSelectElement>('.theme-select')];
let theme = THEMES[loadThemeId(storage)];

/** Switch the theme everywhere: canvas art, page styling, join panel wording, both dropdowns. */
function applyTheme(id: ThemeId): void {
	theme = THEMES[id];
	document.body.classList.remove(...Object.values(THEMES).map((t) => t.bodyClass));
	document.body.classList.add(theme.bodyClass);
	document.getElementById('join-name-label')!.textContent = theme.joinNameLabel;
	document.getElementById('join-hint')!.textContent = touchScreen
		? theme.joinTouchHint
		: theme.joinHint;
	for (const select of themeSelects) {
		select.value = id;
	}
	mapVote.drawPreviews(theme);
	mapPick.drawPreviews(theme);
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

const sounds = new SoundBoard(loadSoundOn(storage), browserAudio);
const cues = new CueTracker();
const soundToggles = [...document.querySelectorAll<HTMLButtonElement>('.sound-toggle')];

/** Show the sound setting on both toggle buttons. */
function showSoundSetting(): void {
	for (const button of soundToggles) {
		button.textContent = sounds.enabled ? 'Sound: on' : 'Sound: off';
		button.setAttribute('aria-pressed', String(sounds.enabled));
	}
}

for (const button of soundToggles) {
	button.addEventListener('click', () => {
		sounds.setEnabled(!sounds.enabled);
		saveSoundOn(storage, sounds.enabled);
		showSoundSetting();
		button.blur();
	});
}
showSoundSetting();
for (const type of ['pointerdown', 'keydown'] as const) {
	window.addEventListener(type, () => sounds.unlock(theme.soundFiles), { capture: true });
}

const selfId = () => (session.joined ? (socket.id ?? null) : null);
socket.on('snapshot', (snapshot) => sounds.play(cues.snapshot(snapshot, selfId()), theme.sounds));
socket.on('leaderboard', (view) => sounds.play(cues.leaderboard(view, selfId()), theme.sounds));
socket.on('disconnect', () => cues.reset());

const saved = loadProfile(storage);
if (saved) {
	panel.setProfile(saved);
}
panel.show();

function frame(now: number): void {
	session.update(now);
	const view = session.view(now);
	const touchTarget = session.joined ? steering.target : null;
	const scale = textScale(canvas.getBoundingClientRect().width);
	drawFrame(ctx, { ...view, touchTarget, textScale: scale }, theme, now);
	scoreboard.update(view.scoreboard);
	bestRuns.update(session.leaderboard, Date.now());
	mapVote.update(view.round, view.myVote, session.joined, view.serverNow);
	if (panel.visible) {
		const phase = view.round?.phase;
		const open = phase === 'voting' || phase === 'results';
		mapPick.update(open ? view.round!.votes : null, session.mapPick ?? view.myVote, true);
	}
	if (panel.visible) {
		panel.setTaken(new Map(view.scoreboard.map((row) => [row.color, row.name])));
	}
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
