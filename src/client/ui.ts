import { PALETTE } from '../shared/constants.js';
import type { LeaderboardView, Period } from '../shared/protocol.js';
import { formatRunTime, ordinal } from './format.js';
import type { ScoreRow } from './render.js';
import type { BoardPrefs } from './storage.js';

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
		this.input.blur();
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
