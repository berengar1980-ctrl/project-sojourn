/** Keep each established integration limit; do not speed up or slow down game time. */
export const COMBAT_STEP_SECONDS = 0.08;
export const LOCAL_PHYSICS_STEP_SECONDS = 0.05;
export const SECTOR_STEP_SECONDS = 0.25;

export function boundedSimulationStep(deltaSeconds: number, limit: number): number {
  return Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, limit)) : 0;
}
