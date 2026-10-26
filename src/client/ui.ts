import { ARENA, PALETTE } from '../shared/constants.js';
import { MAPS, MAP_CHOICES, type MapChoice } from '../shared/maps.js';
import type { LeaderboardView, Period, RoundPhase, RoundState } from '../shared/protocol.js';
import { formatRunTime, ordinal } from './format.js';
import type { ScoreRow } from './render.js';
import type { BoardPrefs } from './storage.js';
import type { Theme } from './theme/types.js';

/** Keep `current` while free, else a random free colour, or null when all are taken. */
export function pickDefaultColor(
	taken: Set<string>,
	current: string | null,
	rng: () => number = Math.random,
): string | null {
	if (current && !taken.has(current)) {
		return current;
	}
	const free = PALETTE.filter((c) => !taken.has(c));
	return free[Math.floor(rng() * free.length)] ?? null;
}

/** The join form shown over the game: name field, colour swatches and a join button. */
export class JoinPanel {
	private readonly input: HTMLInputElement;
	private readonly error: HTMLElement;
	private readonly submit: HTMLButtonElement;
	private readonly swatches = new Map<string, HTMLButtonElement>();
	private selected: string | null = null;
	private takenKey = '';
	private full = false;
	private busy = false;

	constructor(
		private readonly form: HTMLFormElement,
		onSubmit: (name: string, color: string) => Promise<void>,
	) {
		this.input = form.querySelector('input')!;
		this.error = form.querySelector('.join-error')!;
		this.submit = form.querySelector('button[type="submit"]')!;
		const container = form.querySelector('.swatches')!;

		PALETTE.forEach((color, i) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'swatch';
			button.style.backgroundColor = color;
			button.dataset.label = `Colour ${i + 1}`;
			button.setAttribute('aria-label', button.dataset.label);
			button.addEventListener('click', () => {
				if (button.getAttribute('aria-disabled') !== 'true') {
					this.select(color);
				}
			});
			container.append(button);
			this.swatches.set(color, button);
		});

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			if (this.busy) {
				return;
			}
			if (!this.selected) {
				this.error.textContent = 'Pick a colour';
				return;
			}
			this.setBusy(true);
			void onSubmit(this.input.value, this.selected).finally(() => this.setBusy(false));
		});
	}

	get visible(): boolean {
		return !this.form.hidden;
	}

	show(message = ''): void {
		this.form.hidden = false;
		document.body.classList.add('joining');
		this.error.textContent = message;
		this.input.focus();
	}

	hide(): void {
		this.form.hidden = true;
		document.body.classList.remove('joining');
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
	}

	setProfile(profile: { name: string; color: string }): void {
		this.input.value = profile.name;
		this.select(profile.color);
	}

	/** Cross out colours other players use (colour -> player name); no-op if unchanged. */
	setTaken(taken: Map<string, string>): void {
		const key = JSON.stringify([...taken].sort());
		if (key === this.takenKey) {
			return;
		}
		this.takenKey = key;
		for (const [color, button] of this.swatches) {
			const owner = taken.get(color);
			const label = owner === undefined ? button.dataset.label! : `Taken by ${owner}`;
			button.classList.toggle('taken', owner !== undefined);
			button.setAttribute('aria-disabled', String(owner !== undefined));
			button.setAttribute('aria-label', label);
			button.title = owner === undefined ? '' : label;
		}
		this.select(pickDefaultColor(new Set(taken.keys()), this.selected));
		this.full = taken.size >= PALETTE.length;
		this.updateSubmit();
		if (this.full) {
			this.error.textContent = 'Game is full';
		}
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		this.updateSubmit();
	}

	private updateSubmit(): void {
		this.submit.disabled = this.full || this.busy;
	}

	private select(color: string | null): void {
		this.selected = color;
		for (const [c, button] of this.swatches) {
			button.setAttribute('aria-pressed', String(c === color));
		}
	}
}

/** Sorted list of players beside the game; only touches the DOM when its content changes. */
export class Scoreboard {
	private key = '';

	constructor(private readonly list: HTMLElement) {}

	update(rows: ScoreRow[]): void {
		const key = JSON.stringify(rows.map((r) => [r.id, r.name, r.color, r.score, r.self]));
		if (key === this.key) {
			return;
		}
		this.key = key;

		if (rows.length === 0) {
			const empty = document.createElement('li');
			empty.className = 'empty';
			empty.textContent = 'No players yet';
			this.list.replaceChildren(empty);
			return;
		}

		this.list.replaceChildren(
			...rows.map((row) => {
				const item = document.createElement('li');
				item.classList.toggle('self', row.self);
				const dot = document.createElement('span');
				dot.className = 'dot';
				dot.style.backgroundColor = row.color;
				const name = document.createElement('span');
				name.className = 'name';
				name.textContent = row.name;
				const score = document.createElement('span');
				score.className = 'score';
				score.textContent = String(row.score);
				item.append(dot, name, score);
				return item;
			}),
		);
	}
}

/** "Best runs" panel: Period and Showing toggles over the server's leaderboard view. */
export class BestRunsPanel {
	private readonly periodButtons: HTMLButtonElement[];
	private readonly scopeButtons: HTMLButtonElement[];
	private readonly rankLine: HTMLElement;
	private readonly list: HTMLElement;
	private renderedKey = '';

	constructor(
		root: HTMLElement,
		private prefs: BoardPrefs,
		onChange: (prefs: BoardPrefs) => void,
	) {
		this.periodButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-period]')];
		this.scopeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-scope]')];
		this.rankLine = root.querySelector('.best-runs-rank')!;
		this.list = root.querySelector('.best-runs-list')!;
		for (const button of this.periodButtons) {
			button.addEventListener('click', () => {
				this.prefs = { ...this.prefs, period: button.dataset.period as Period };
				onChange(this.prefs);
			});
		}
		for (const button of this.scopeButtons) {
			button.addEventListener('click', () => {
				this.prefs = { ...this.prefs, scope: button.dataset.scope as BoardPrefs['scope'] };
				onChange(this.prefs);
			});
		}
	}

	/** Show `view` for the current choices; only touches the DOM when something changed. */
	update(view: LeaderboardView | null, now: number): void {
		const key = JSON.stringify([this.prefs, view?.boards ?? null, new Date(now).toDateString()]);
		if (key === this.renderedKey) {
			return;
		}
		this.renderedKey = key;

		for (const b of this.periodButtons) {
			b.setAttribute('aria-pressed', String(b.dataset.period === this.prefs.period));
		}
		for (const b of this.scopeButtons) {
			b.setAttribute('aria-pressed', String(b.dataset.scope === this.prefs.scope));
		}

		const board = view?.boards[this.prefs.period];
		const mine = this.prefs.scope === 'mine';
		this.rankLine.hidden = !mine || !board;
		if (mine && board) {
			this.rankLine.textContent = board.myRank
				? `Your rank: ${ordinal(board.myRank)}`
				: 'Not ranked';
		}

		const rows: [string, string, string, boolean][] = !board
			? []
			: mine
				? board.mine.map((r) => [String(r.score), r.name, formatRunTime(r.finishedAt, now), false])
				: board.everyone.map((r, i) => [`${i + 1}.`, r.name, String(r.score), r.self]);
		if (rows.length === 0) {
			const empty = document.createElement('li');
			empty.className = 'empty';
			empty.textContent = view ? 'No runs yet' : 'Loading…';
			this.list.replaceChildren(empty);
			return;
		}
		this.list.replaceChildren(
			...rows.map(([lead, name, trail, self]) => {
				const item = document.createElement('li');
				item.classList.toggle('self', self);
				for (const [cls, text] of [
					['lead', lead],
					['name', name],
					['trail', trail],
				] as const) {
					const span = document.createElement('span');
					span.className = cls;
					span.textContent = text;
					item.append(span);
				}
				return item;
			}),
		);
	}
}

/** Heading of the map vote panel; `msLeft` is the time until the vote closes. */
export function voteTitle(phase: RoundPhase, msLeft: number, canVote: boolean): string {
	const seconds = `${Math.max(0, Math.ceil(msLeft / 1000))} s`;
	if (!canVote) {
		return `Next map vote · ${seconds} (join to vote)`;
	}
	return phase === 'voting' ? `Pick the map · ${seconds}` : `Vote for the next map · ${seconds}`;
}

const PREVIEW_WIDTH = 96;
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * ARENA.height) / ARENA.width);

/** Map cards under the game while a vote is open: previews, live counts, our vote highlighted. */
export class MapVotePanel {
	private readonly title: HTMLElement;
	private readonly cards = new Map<
		MapChoice,
		{ button: HTMLButtonElement; count: HTMLElement; preview: HTMLCanvasElement }
	>();
	private shown = '';

	constructor(
		private readonly root: HTMLElement,
		onVote: (choice: MapChoice) => void,
	) {
		this.title = root.querySelector('.map-vote-title')!;
		const list = root.querySelector('.map-vote-cards')!;
		for (const choice of MAP_CHOICES) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'map-card';
			const preview = document.createElement('canvas');
			preview.width = PREVIEW_WIDTH * 2;
			preview.height = PREVIEW_HEIGHT * 2;
			const name = document.createElement('span');
			name.className = 'map-card-name';
			name.textContent = choice === 'random' ? 'Random' : MAPS[choice].name;
			const count = document.createElement('span');
			count.className = 'map-card-count';
			button.append(preview, name, count);
			button.addEventListener('click', () => {
				onVote(choice);
				button.blur();
			});
			list.append(button);
			this.cards.set(choice, { button, count, preview });
		}
	}

	/** Redraw the small map previews in `theme`'s look (call when the theme changes). */
	drawPreviews(theme: Theme): void {
		for (const [choice, { preview }] of this.cards) {
			const ctx = preview.getContext('2d');
			if (!ctx) {
				continue;
			}
			const scale = preview.width / ARENA.width;
			ctx.setTransform(scale, 0, 0, scale, -ARENA.x * scale, -ARENA.y * scale);
			theme.drawArena(ctx);
			if (choice === 'random') {
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
				ctx.fillRect(0, 0, preview.width, preview.height);
				ctx.fillStyle = '#ffffff';
				ctx.font = `bold ${Math.round(preview.height * 0.6)}px system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('?', preview.width / 2, preview.height / 2);
			} else {
				theme.drawObstacles(ctx, MAPS[choice].obstacles);
			}
		}
	}

	/** Show or hide the panel and refresh counts; only touches the page when something changed. */
	update(
		round: RoundState | null,
		myVote: MapChoice | null,
		canVote: boolean,
		serverNow: number,
	): void {
		const open = round !== null && (round.phase === 'voting' || round.phase === 'results');
		const title = open ? voteTitle(round.phase, (round.endsAt ?? 0) - serverNow, canVote) : '';
		const key = open ? `${title}|${myVote}|${canVote}|${JSON.stringify(round.votes)}` : 'closed';
		if (key === this.shown) {
			return;
		}
		this.shown = key;
		this.root.hidden = !open;
		if (!open) {
			return;
		}
		this.title.textContent = title;
		for (const [choice, { button, count }] of this.cards) {
			const votes = round.votes[choice];
			count.textContent = votes === 1 ? '1 vote' : `${votes} votes`;
			button.setAttribute('aria-pressed', String(myVote === choice));
			button.disabled = !canVote;
		}
	}
}
