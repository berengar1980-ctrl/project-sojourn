import type { WorldPoint } from '../../core/world-types';
import type { SectorNpcState } from '../../core/npc-types';

export const WORKER_SCAN_SECONDS = 5;

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
