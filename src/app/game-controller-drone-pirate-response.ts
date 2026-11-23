import { fieldInterceptRange } from '../systems/npcs/npc-combat-ai';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { AsteroidFieldRuntime } from '../systems/operations/asteroid-field-world';
import type { WorldPoint } from '../core/world-types';
import { localMiningCombatArena } from './game-controller-combat';

export interface SecurityPirateContact {
  readonly id: string;
  readonly position: WorldPoint;
}

/** Any sighted pirate is hostile, regardless of its current target.
 * Ships already in a duel remain owned by that combat and cannot be engaged twice.
 */
export function detectedSecurityPirate(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime
): SecurityPirateContact | null {
  if (!field.drone.snapshot().operational) return null;
  const ships = field.pirates?.snapshot(context.economy.sectorNpcs.npcs) ?? [];
  const available = ships.filter((ship) => {
    const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === ship.npcId);
    return (
      npc?.pirate && npc.hullHp > 0 && field.drone.detect(ship.position, field.instance.asteroids)
    );
  });
  available.sort((a, b) => {
    const combatStatus = (id: string): number => {
      const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === id);
      return npc?.combatMovement || (npc?.combatRecoverySeconds ?? 0) > 0 ? 1 : 0;
    };
    const status = combatStatus(a.npcId) - combatStatus(b.npcId);
    if (status !== 0) return status;
    const drone = field.drone.snapshot().position;
    return (
      Math.hypot(a.position.x - drone.x, a.position.y - drone.y) -
      Math.hypot(b.position.x - drone.x, b.position.y - drone.y)
    );
  });
  const pirate = available[0];
  return pirate ? { id: pirate.npcId, position: pirate.position } : null;
}

export function interceptSecurityPirate(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  pirate: SecurityPirateContact
): boolean {
  const drone = field.drone;
  const position = drone.snapshot().position;
  const gap = Math.hypot(position.x - pirate.position.x, position.y - pirate.position.y);
  if (gap > fieldInterceptRange('security-drone:' + field.locationId, false)) return false;
  const defender = context.economy.sectorNpcs.npcs.find(
    (npc) => npc.id === 'security-drone:' + field.locationId
  );
  if (!defender || defender.hullHp <= 0 || defender.combatMovement) return false;
  const pirateNpc = context.economy.sectorNpcs.npcs.find((npc) => npc.id === pirate.id);
  if (!pirateNpc || pirateNpc.combatMovement) return false;
  const started = context.engagements.engageNpcsInArena(pirate.id, defender.id, {
    ...localMiningCombatArena(field.instance, { x: 0, y: 0 }),
    attackerPosition: { ...pirate.position },
    attackerHeadingRadians: 0,
    attackerVelocity: { x: 0, y: 0 },
    defenderPosition: { ...position },
    defenderHeadingRadians: drone.headingRadians,
    defenderVelocity: { x: 0, y: 0 },
  });
  if (started) {
    context.systemLog.write(
      'SEC-01 > PIRAT ERKANNT: ' + pirateNpc.name.toUpperCase() + ' · ABGEFANGEN'
    );
  }
  return started;
}

export { securityPirateApproach } from '../systems/operations/asteroid-security-drone';
