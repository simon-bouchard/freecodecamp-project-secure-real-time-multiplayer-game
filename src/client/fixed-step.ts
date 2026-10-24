/** Turns variable frame times into a whole number of fixed-length steps ("fix your timestep"). */
export class FixedStep {
	private last: number | null = null;
	private accumulated = 0;

	constructor(
		private readonly stepMs: number,
		private readonly maxSteps = 5,
	) {}

	/** Number of steps to run for the time elapsed since the previous call. */
	advance(now: number): number {
		if (this.last === null) {
			this.last = now;
			return 0;
		}
		this.accumulated += now - this.last;
		this.last = now;
		const steps = Math.floor(this.accumulated / this.stepMs);
		this.accumulated -= steps * this.stepMs;
		if (steps > this.maxSteps) {
			this.accumulated = 0;
			return this.maxSteps;
		}
		return steps;
	}

	/** Progress through the current step, from 0 to 1, for drawing between steps. */
	get alpha(): number {
		return this.accumulated / this.stepMs;
	}
}
