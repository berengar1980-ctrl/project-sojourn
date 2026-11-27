import { isSecurityDrone, SECURITY_DRONE_REPLACEMENT_SECONDS } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { npcRecoveryLocation } from './npc-sector-recovery-location';
import { npcOrbitStateFor } from './npc-orbit';
import { serviceNpcAtLocation } from './npc-port-economy';
import { hashId } from './npc-sector-routing';

const COMBAT_RECOVERY_MIN_SECONDS = 45;

const COMBAT_RECOVERY_SPAN_SECONDS = 76;

export function beginNpcCombatRecovery(
  world: WorldMap,
  npc: SectorNpcState,
  position: WorldPoint,
  reason: string,
  retire: () => boolean
): boolean {
  if (npc.retiredUntilDay !== undefined || (npc.combatRecoverySeconds ?? 0) > 0) return true;
  if (isSecurityDrone(npc.id)) {
    delete npc.combatMovement;
    delete npc.travel;
    npc.combatDefeats = (npc.combatDefeats ?? 0) + 1;
    npc.combatRecoverySeconds = SECURITY_DRONE_REPLACEMENT_SECONDS;
    npc.activityId = 'repair';
    npc.activity = 'Ersatzdrohne unterwegs';
    return true;
  }
  const destinationId = npcRecoveryLocation(world, npc, position);
  if (!destinationId) return false;

  delete npc.travel;
  delete npc.combatMovement;
  npc.locationId = destinationId;
  npc.orbit = npcOrbitStateFor(world, npc, destinationId);
  // Emergency recovery returns a disabled ship to port, not a free full repair.
  npc.hullHp = 1;
  npc.combatDefeats = (npc.combatDefeats ?? 0) + 1;
  if (retire()) return true;
  npc.combatRecoveryLocationId = destinationId;
  npc.combatRecoverySeconds =
    COMBAT_RECOVERY_MIN_SECONDS +
    (hashId(npc.id + ':' + npc.combatDefeats) % COMBAT_RECOVERY_SPAN_SECONDS);
  npc.activityId = 'repair';
  npc.activity = reason + ' · geborgen · Reparatur';
  return true;
}

export function advanceNpcCombatRecovery(
  world: WorldMap,
  npc: SectorNpcState,
  deltaSeconds: number
): boolean {
  const remaining = npc.combatRecoverySeconds ?? 0;
  if (remaining <= 0) return false;
  npc.combatRecoverySeconds = Math.max(0, remaining - deltaSeconds);
  if (npc.combatRecoverySeconds > 0) return true;

  if (isSecurityDrone(npc.id)) npc.hullHp = npc.hullMaxHp;
  else serviceNpcAtLocation(world, npc);
  delete npc.combatRecoverySeconds;
  delete npc.combatRecoveryLocationId;
  const intact = npc.hullHp >= npc.hullMaxHp;
  npc.activityId = intact
    ? npc.pirate
      ? 'raiding'
      : npc.job === 'patrol'
        ? 'patrol'
        : 'dock'
    : 'maintenance';
  npc.activity = intact
    ? 'Reparatur abgeschlossen · bereit'
    : 'Teilreparatur · weitere Wartung nur gegen Credits';
  return true;
}
