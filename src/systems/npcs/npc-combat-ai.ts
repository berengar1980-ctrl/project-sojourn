import type { SectorNpcState } from '../../core/npc-types';

export type NpcDefenseReaction = 'fight' | 'flee';

export function npcDefenseReaction(npc: SectorNpcState): NpcDefenseReaction {
  // Freight operators protect their cargo by escaping, never by accepting a duel.
  if (npc.job === 'freighter') return 'flee';
  const hullRatio = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
  const roleBonus = npc.job === 'patrol' || npc.pirate ? 28 : 0;
  const score = npc.aggression + roleBonus + hullRatio * 18;
  return score >= 72 ? 'fight' : 'flee';
}

export function npcMayInitiateAttack(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement || (npc.combatRecoverySeconds ?? 0) > 0) return false;
  if (npc.pirate) return npc.aggression >= 60;
  // An operational patrol either intercepts known pirates or withdraws when unfit to fight.
  return npc.job === 'patrol' && npcDefenseReaction(npc) === 'fight';
}

export function npcLooksHostileToPatrol(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement || (npc.combatRecoverySeconds ?? 0) > 0) {
    return false;
  }
  // Aggression is a personality/combat-response trait, not evidence of a crime.
  // Normal freighters, miners and salvagers are never automatic patrol targets.
  return npc.pirate === true;
}

export function npcIsPiratePrey(npc: SectorNpcState): boolean {
  return (
    npc.hullHp > 0 &&
    !npc.pirate &&
    !npc.combatMovement &&
    (npc.combatRecoverySeconds ?? 0) <= 0 &&
    (npc.job === 'freighter' || npc.job === 'miner' || npc.job === 'salvager')
  );
}

/** Hostile pirate outfits can encounter and attack one another on the sector map. */
export function rivalPirateGroups(a: SectorNpcState, b: SectorNpcState): boolean {
  if ((!a.pirate && a.job !== 'pirate') || (!b.pirate && b.job !== 'pirate')) return false;
  const groupA = a.factionId ?? a.pirateMark ?? 'pirates';
  const groupB = b.factionId ?? b.pirateMark ?? 'pirates';
  return groupA !== groupB;
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
      const available = target.hullHp > 0 && (target.combatRecoverySeconds ?? 0) <= 0;
      return target.pirate === true && available;
    }
    return npcLooksHostileToPatrol(target);
  }
  if (rivalPirateGroups(attacker, target))
    return target.hullHp > 0 && !target.combatMovement && (target.combatRecoverySeconds ?? 0) <= 0;
  return npcIsPiratePrey(target);
}
