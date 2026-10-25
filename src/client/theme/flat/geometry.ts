/** Closed ring whose radius follows a sine wave: `waves` bumps of height `amplitude`. */
export function wavyRingPath(
	radius: number,
	waves: number,
	amplitude: number,
	steps = 240,
): string {
	const parts: string[] = [];
	for (let i = 0; i < steps; i++) {
		const t = (i / steps) * Math.PI * 2;
		const r = radius + amplitude * Math.cos(waves * t);
		parts.push(`${(r * Math.sin(t)).toFixed(2)} ${(-r * Math.cos(t)).toFixed(2)}`);
	}
	return `M${parts.join(' L')} Z`;
}
