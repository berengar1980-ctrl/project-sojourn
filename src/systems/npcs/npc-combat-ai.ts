import type { SectorNpcState } from '../../core/npc-types';

export type NpcDefenseReaction = 'fight' | 'flee';

export function npcDefenseReaction(npc: SectorNpcState): NpcDefenseReaction {
  const hullRatio = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
  const roleBonus = npc.job === 'patrol' || npc.pirate ? 28 : npc.job === 'freighter' ? -8 : 0;
  const score = npc.aggression + roleBonus + hullRatio * 18;
  return score >= 72 ? 'fight' : 'flee';
}

export function npcMayInitiateAttack(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement || (npc.combatRecoverySeconds ?? 0) > 0) return false;
  if (npc.pirate) return npc.aggression >= 60;
  return npc.job === 'patrol' && npc.aggression >= 60;
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
