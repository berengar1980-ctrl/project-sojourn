/**
 * The combat simulation stops at victory; short visual effects may continue
 * fading in wall time without changing any gameplay state.
 */
export class CombatEffectClock {
  private elapsedSeconds = 0;
  private finishedAt: number | null = null;

  update(simulationSeconds: number, finished: boolean, wallSeconds: number): void {
    this.elapsedSeconds = simulationSeconds;
    if (!finished) this.finishedAt = null;
    else if (this.finishedAt === null) this.finishedAt = wallSeconds;
  }

  elapsed(wallSeconds: number): number {
    const overtime = this.finishedAt === null ? 0 : Math.max(0, wallSeconds - this.finishedAt);
    return this.elapsedSeconds + overtime;
  }
}
