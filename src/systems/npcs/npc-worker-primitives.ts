import { npcCargoUsed } from '../economy/npc-cargo';
import type { WorldPoint } from '../../core/world-types';
import type { SectorNpcState } from '../../core/npc-types';

export const WORKER_SCAN_SECONDS = 5;
const MAX_WORKER_STEP_SECONDS = 0.08;

export function workerStepSeconds(deltaSeconds: number): number {
  return Math.min(Math.max(0, deltaSeconds), MAX_WORKER_STEP_SECONDS);
}

export function workerCargoFull(npc: SectorNpcState): boolean {
  return npcCargoUsed(npc) >= Math.max(1, Math.floor(npc.cargoCapacity));
}

export function workerCombatSuspended(npc: SectorNpcState): boolean {
  return Boolean(npc.combatMovement) || (npc.combatRecoverySeconds ?? 0) > 0;
}

export function workerAtAssignment(npc: SectorNpcState, locationId: string): boolean {
  return (
    npc.workLocationId === locationId &&
    npc.locationId === locationId &&
    npc.hullHp > 0 &&
    npc.retiredUntilDay === undefined &&
    !npc.travel &&
    !workerCombatSuspended(npc) &&
    npc.autonomy?.phase === 'working'
  );
}

interface WorkerScanState {
  speed: number;
  scanProgress: number;
}

export function advanceWorkerScan(ship: WorkerScanState, dt: number): boolean {
  ship.speed = 0;
  ship.scanProgress = Math.min(1, ship.scanProgress + dt / WORKER_SCAN_SECONDS);
  return ship.scanProgress >= 1;
}

export function workerMustExit(npc: SectorNpcState, accepted: number): boolean {
  return accepted <= 0 || workerCargoFull(npc);
}

export function moveToward(
  ship: { position: WorldPoint; headingRadians: number; speed: number },
  target: WorldPoint,
  speed: number,
  dt: number
): boolean {
  const dx = target.x - ship.position.x;
  const dy = target.y - ship.position.y;
  const remaining = Math.hypot(dx, dy);
  ship.headingRadians = Math.atan2(dy, dx);
  ship.speed = speed;
  if (remaining <= Math.max(2, speed * dt)) {
    ship.position = { ...target };
    ship.speed = 0;
    return true;
  }
  ship.position = {
    x: ship.position.x + (dx / remaining) * speed * dt,
    y: ship.position.y + (dy / remaining) * speed * dt,
  };
  return false;
}

export { npcCargoUsed as cargoUsed } from '../economy/npc-cargo';

interface WorkerEventChoice {
  readonly risk: 'safe' | 'controlled' | 'risky' | 'high_risk';
}

export function chooseEventChoice<T extends WorkerEventChoice>(
  npc: SectorNpcState,
  choices: readonly T[]
): T | null {
  if (choices.length === 0) return null;
  const rank = { safe: 0, controlled: 1, risky: 2, high_risk: 3 } as const;
  const risky = npc.workRiskPreference === 'risky';
  return (
    [...choices].sort((a, b) =>
      risky ? rank[b.risk] - rank[a.risk] : rank[a.risk] - rank[b.risk]
    )[0] ?? null
  );
}
