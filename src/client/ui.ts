import { PALETTE } from '../shared/constants.js';
import type { ScoreRow } from './render.js';

/** The join form shown over the game: name field, colour swatches and a join button. */
export class JoinPanel {
	private readonly input: HTMLInputElement;
	private readonly error: HTMLElement;
	private readonly submit: HTMLButtonElement;
	private readonly swatches = new Map<string, HTMLButtonElement>();
	private selected: string | null = null;
	private takenKey = '';

	constructor(
		private readonly form: HTMLFormElement,
		onSubmit: (name: string, color: string) => void,
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
			button.setAttribute('aria-label', `Colour ${i + 1}`);
			button.addEventListener('click', () => this.select(color));
			container.append(button);
			this.swatches.set(color, button);
		});

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			if (!this.selected) {
				this.error.textContent = 'Pick a colour';
				return;
			}
			onSubmit(this.input.value, this.selected);
		});
	}

	get visible(): boolean {
		return !this.form.hidden;
	}

	show(message = ''): void {
		this.form.hidden = false;
		this.error.textContent = message;
		this.input.focus();
	}

	hide(): void {
		this.form.hidden = true;
		this.input.blur();
	}

	setProfile(profile: { name: string; color: string }): void {
		this.input.value = profile.name;
		this.select(profile.color);
	}

	/** Grey out colours other players use; does nothing if the set is unchanged. */
	setTaken(taken: Set<string>): void {
		const key = [...taken].sort().join();
		if (key === this.takenKey) {
			return;
		}
		this.takenKey = key;
		for (const [color, button] of this.swatches) {
			button.disabled = taken.has(color);
		}
		if (this.selected && taken.has(this.selected)) {
			this.select(null);
		}
		const full = taken.size >= PALETTE.length;
		this.submit.disabled = full;
		if (full) {
			this.error.textContent = 'Game is full';
		}
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
