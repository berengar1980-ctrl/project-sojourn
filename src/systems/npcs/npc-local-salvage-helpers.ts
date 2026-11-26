import { npcOperationalRoleAllowed } from '../operations/ship-operation-permissions';
import type { SectorNpcState } from '../../core/npc-types';
import type { SalvageEventChoice, SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { getShipDefinition, resolveShipRuntimeSetup, stationFactor } from '../ships';

export const APPROACH_DISTANCE = 120;
export const FLIGHT_SPEED = 82;
export const SCAN_SECONDS = 5;
export const BASE_CYCLE_SECONDS = 1.4;

export function hashId(id: string): number {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

export function cargoUsed(npc: SectorNpcState): number {
  return Object.values(npc.cargo).reduce((sum, amount) => sum + Math.max(0, Math.floor(amount)), 0);
}

export function eligible(npc: SectorNpcState, locationId: string): boolean {
  return (
    npcOperationalRoleAllowed(npc, 'salvage') &&
    npc.workLocationId === locationId &&
    npc.locationId === locationId &&
    npc.hullHp > 0 && npc.retiredUntilDay === undefined &&
    !npc.combatMovement && (npc.combatRecoverySeconds ?? 0) <= 0 &&
    !npc.travel &&
    npc.autonomy?.phase === 'working' &&
    cargoUsed(npc) < Math.max(1, Math.floor(npc.cargoCapacity))
  );
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

export function chooseEventChoice(
  npc: SectorNpcState,
  choices: readonly SalvageEventChoice[]
): SalvageEventChoice | null {
  if (choices.length === 0) return null;
  const rank = { safe: 0, controlled: 1, risky: 2, high_risk: 3 } as const;
  const risky = npc.workRiskPreference === 'risky';
  return (
    [...choices].sort((a, b) =>
      risky ? rank[b.risk] - rank[a.risk] : rank[a.risk] - rank[b.risk]
    )[0] ?? null
  );
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
