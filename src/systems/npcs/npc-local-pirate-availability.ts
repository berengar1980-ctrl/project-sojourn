import { isSecurityDrone } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';
import { localArmedTraffic } from './npc-combat-ai';

export function availableLocalTraffic(npc: SectorNpcState): boolean {
  return Boolean(
    localArmedTraffic(npc) &&
    npc.hullHp > 0 &&
    (!isSecurityDrone(npc.id) || (npc.combatRecoverySeconds ?? 0) <= 0) &&
    npc.retiredUntilDay === undefined &&
    (!npc.travel || npc.combatMovement)
  );
}

export function keepCombatReturn(id: string, npc: SectorNpcState | undefined): boolean {
  return (
    !isSecurityDrone(id) && Boolean(npc?.combatMovement || (npc?.combatRecoverySeconds ?? 0) > 0)
  );
}
