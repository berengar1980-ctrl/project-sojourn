import { pirateGroupId } from '../../core/pirate-ports';
import { DRONE_SCAN_RADIUS, isSecurityDrone } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';

export type NpcDefenseReaction = 'fight' | 'flee';

export function isStationedDrone(id?: string): boolean {
  return Boolean(id?.startsWith('security-drone:') && !id.includes(':escort-'));
}

export function fieldInterceptRange(id: string, pirate: boolean): number {
  if (isSecurityDrone(id)) return DRONE_SCAN_RADIUS;
  return pirate ? 210 : 180;
}

export function localArmedTraffic(npc: SectorNpcState): boolean {
  return (
    npc.pirate || npc.job === 'freighter' || (npc.job === 'patrol' && !isStationedDrone(npc.id))
  );
}

export function npcDefenseReaction(npc: SectorNpcState): NpcDefenseReaction {
  // Freight operators protect their cargo by escaping, never by accepting a duel.
  if (npc.id?.startsWith('security-drone:')) return 'fight';
  if (npc.job === 'freighter') return 'flee';
  const hullRatio = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
  const roleBonus = npc.job === 'patrol' || npc.pirate ? 28 : 0;
  const score = npc.aggression + roleBonus + hullRatio * 18;
  return score >= 72 ? 'fight' : 'flee';
}

export function npcAvailableForCombat(npc: SectorNpcState, allowEngaged = false): boolean {
  const recovered = (npc.combatRecoverySeconds ?? 0) <= 0;
  return npc.hullHp > 0 && (allowEngaged || !npc.combatMovement) && recovered;
}

export function npcMayInitiateAttack(npc: SectorNpcState): boolean {
  if (!npcAvailableForCombat(npc)) return false;
  if (npc.pirate) return npc.aggression >= 60;
  // An operational patrol either intercepts known pirates or withdraws when unfit to fight.
  return npc.job === 'patrol' && npcDefenseReaction(npc) === 'fight';
}

export function npcLooksHostileToPatrol(npc: SectorNpcState): boolean {
  if (!npcAvailableForCombat(npc)) return false;
  // Aggression is a personality/combat-response trait, not evidence of a crime.
  // Normal freighters, miners and salvagers are never automatic patrol targets.
  return npc.pirate === true;
}

export function npcIsPiratePrey(npc: SectorNpcState): boolean {
  const civilianWorker = npc.job === 'freighter' || npc.job === 'miner' || npc.job === 'salvager';
  return npcAvailableForCombat(npc) && !npc.pirate && civilianWorker;
}

/** Hostile pirate outfits can encounter and attack one another on the sector map. */
export function rivalPirateGroups(a: SectorNpcState, b: SectorNpcState): boolean {
  if ((!a.pirate && a.job !== 'pirate') || (!b.pirate && b.job !== 'pirate')) return false;
  return pirateGroupId(a) !== pirateGroupId(b);
}

/** One NPC-versus-NPC target policy for campaign encounters and FleetCombat labs. */
export function npcMayTargetNpc(
  attacker: SectorNpcState,
  target: SectorNpcState,
  joiningExistingCombat = false
): boolean {
  if (attacker.id === target.id) return false;
  if (!attacker.pirate) {
    if (joiningExistingCombat) {
      const available = npcAvailableForCombat(target, true);
      return target.pirate === true && available;
    }
    return npcLooksHostileToPatrol(target);
  }
  if (rivalPirateGroups(attacker, target)) return npcAvailableForCombat(target);
  return npcIsPiratePrey(target);
}

/** Protection is explicit and applies only to the faction actually paid. */
export function protectedFromPirate(pirate: SectorNpcState, target: SectorNpcState): boolean {
  const protection = target.smugglingProtectionFaction;
  return protection !== undefined && protection === pirateGroupId(pirate);
}
