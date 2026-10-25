/** Milliseconds as `m:ss`, rounded up to whole seconds and never negative. */
export function formatClock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Results headline for the given winner names. */
export function winnerText(names: string[]): string {
	if (names.length === 0) {
		return 'No winner';
	}
	return names.length === 1 ? `Winner: ${names[0]}` : `Tie: ${names.join(', ')}`;
}

/** Whether an expiring pickup is drawn this frame: steady, then blinking in its last 2 seconds. */
export function blinkVisible(remainingMs: number): boolean {
	if (remainingMs >= 2000) {
		return true;
	}
	return Math.floor((2000 - remainingMs) / 150) % 2 === 0;
}
