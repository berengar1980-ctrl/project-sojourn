import type { SectorNpcState } from '../../core/npc-types';

export type NpcDefenseReaction = 'fight' | 'flee';

export function npcDefenseReaction(npc: SectorNpcState): NpcDefenseReaction {
  const hullRatio = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
  const roleBonus = npc.job === 'patrol' || npc.pirate ? 28 : npc.job === 'freighter' ? -8 : 0;
  const score = npc.aggression + roleBonus + hullRatio * 18;
  return score >= 72 ? 'fight' : 'flee';
}

export function npcMayInitiateAttack(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement) return false;
  if (npc.pirate) return npc.aggression >= 60;
  return npc.job === 'patrol' && npc.aggression >= 60;
}

export function npcLooksHostileToPatrol(npc: SectorNpcState): boolean {
  if (npc.hullHp <= 0 || npc.combatMovement) return false;
  if (npc.pirate) return true;
  if (npc.job === 'patrol') return false;
  return npc.aggression >= 65;
}

export function npcIsPiratePrey(npc: SectorNpcState): boolean {
  return (
    npc.hullHp > 0 &&
    !npc.pirate &&
    !npc.combatMovement &&
    (npc.job === 'freighter' || npc.job === 'miner' || npc.job === 'salvager')
  );
}
