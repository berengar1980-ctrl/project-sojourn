import { workerAtAssignment } from './npc-worker-primitives';
export { cargoUsed, chooseEventChoice } from './npc-worker-primitives';
import { stableHash as hashId } from '../../core/stable-hash';
import { npcOperationalRoleAllowed } from '../operations/ship-operation-permissions';
import type { SectorNpcState } from '../../core/npc-types';
import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { getShipDefinition, resolveShipRuntimeSetup, stationFactor } from '../ships';

export const APPROACH_DISTANCE = 120;
export const FLIGHT_SPEED = 82;
export { WORKER_SCAN_SECONDS as SCAN_SECONDS } from './npc-worker-primitives';
export const BASE_CYCLE_SECONDS = 1.4;

export { stableHash as hashId } from '../../core/stable-hash';

export function eligible(npc: SectorNpcState, locationId: string): boolean {
  return npcOperationalRoleAllowed(npc, 'salvage') && workerAtAssignment(npc, locationId);
}

export function wreckRemaining(wreck: SalvageWreck): number {
  return wreck.resources.reduce((sum, entry) => sum + Math.max(0, entry.remainingAmount), 0);
}

export function chooseWreck(
  npc: SectorNpcState,
  field: SalvageField,
  occupied: ReadonlySet<string>
): SalvageWreck | null {
  const candidates = field.wrecks.filter(
    (wreck) =>
      !occupied.has(wreck.id) &&
      (wreckRemaining(wreck) > 0 || wreck.componentStatus === 'available')
  );
  if (candidates.length === 0) return null;
  return (
    [...candidates].sort(
      (a, b) =>
        b.quality - a.quality || wreckRemaining(b) - wreckRemaining(a) || a.id.localeCompare(b.id)
    )[hashId(npc.id) % Math.min(4, candidates.length)] ??
    candidates[0] ??
    null
  );
}

export function workPoint(npcId: string, wreck: SalvageWreck): WorldPoint {
  const angle = ((hashId(npcId + ':' + wreck.id) % 6283) / 1000) % (Math.PI * 2);
  const range = wreck.radius + APPROACH_DISTANCE;
  return {
    x: wreck.position.x + Math.cos(angle) * range,
    y: wreck.position.y + Math.sin(angle) * range,
  };
}

export function recoveryAmount(npc: SectorNpcState, wreck: SalvageWreck): number {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return 3 + wreck.quality * 2;
  const runtime = resolveShipRuntimeSetup(ship);
  const crewMultiplier = stationFactor(20, 0.35);
  return Math.max(
    1,
    Math.round((3 + wreck.quality * 2) * runtime.salvage.yieldMultiplier * crewMultiplier)
  );
}
