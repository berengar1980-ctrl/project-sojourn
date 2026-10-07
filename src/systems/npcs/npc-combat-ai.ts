import type { SectorNpcState } from '../../core/npc-types';

export type NpcDefenseReaction = 'fight' | 'flee';

export function npcDefenseReaction(npc: SectorNpcState): NpcDefenseReaction {
  const hullRatio = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
  const roleBonus = npc.pirate ? 34 : npc.job === 'patrol' ? 28 : npc.job === 'freighter' ? -8 : 0;
  const score = npc.aggression + roleBonus + hullRatio * 18;
  return score >= 72 ? 'fight' : 'flee';
}

export function npcMayInitiateAttack(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement) return false;
  return (npc.pirate && npc.aggression >= 65) || (npc.job === 'patrol' && npc.aggression >= 60);
}

export function npcLooksHostileToPatrol(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement) return false;
  if (npc.pirate) return true;
  if (npc.job === 'patrol') return false;
  return npc.aggression >= 65;
}
