import type { EngagementRuntime } from './star-map-engagement-runtime-types';
import type { SectorNpcState } from '../../core/npc-types';
import { getShipDefinition } from '../ships';
import { distance, engagementRange } from './npc-engagement-geometry';

const FLEE_GAIN_REQUIRED = 520;

function engagementNpc(runtime: EngagementRuntime, id: string): SectorNpcState | null {
  return runtime.options.sectorNpcs.npcs.find((npc) => npc.id === id) ?? null;
}

function releaseAbandonedChase(
  runtime: EngagementRuntime,
  attacker: SectorNpcState | null,
  target: SectorNpcState | null,
  attackerId: string,
  targetId: string
): void {
  for (const [npc, opponentId] of [
    [attacker, targetId],
    [target, attackerId],
  ] as const) {
    if (
      npc &&
      npc.hullHp > 0 &&
      npc.retiredUntilDay === undefined &&
      npc.combatMovement &&
      npc.combatMovement.mode !== 'engaged' &&
      npc.combatMovement.targetId === opponentId
    ) {
      runtime.options.sectorNpcs.recoverFromCombat(npc, 'Abfangversuch beendet');
    }
  }
}

export function updateNpcChases(
  runtime: EngagementRuntime,
  beginBackgroundCombat: (
    runtime: EngagementRuntime,
    attacker: SectorNpcState,
    target: SectorNpcState
  ) => void
): void {
  for (const [attackerId, chase] of [...runtime.npcChases]) {
    const attacker = engagementNpc(runtime, attackerId);
    const target = engagementNpc(runtime, chase.targetId);
    if (
      !attacker ||
      !target ||
      attacker.hullHp <= 0 ||
      target.hullHp <= 0 ||
      attacker.retiredUntilDay !== undefined ||
      target.retiredUntilDay !== undefined ||
      attacker.combatMovement?.mode !== 'pursue' ||
      attacker.combatMovement.targetId !== chase.targetId ||
      target.combatMovement?.mode === 'engaged'
    ) {
      releaseAbandonedChase(runtime, attacker, target, attackerId, chase.targetId);
      runtime.npcChases.delete(attackerId);
      continue;
    }
    const attackerPosition = runtime.options.sectorNpcs.livePosition(attacker);
    const targetPosition = runtime.options.sectorNpcs.livePosition(target);
    const currentDistance = distance(attackerPosition, targetPosition);
    const attackerShip = getShipDefinition(attacker.shipId);
    const targetShip = getShipDefinition(target.shipId);
    if (!attackerShip || !targetShip) continue;
    if (currentDistance <= engagementRange(attackerShip, targetShip)) {
      beginBackgroundCombat(runtime, attacker, target);
      continue;
    }
    if (
      runtime.options.sectorNpcs.combatMode(target) === 'flee' &&
      currentDistance >= chase.initialDistance + FLEE_GAIN_REQUIRED
    ) {
      runtime.options.sectorNpcs.recoverFromCombat(attacker, 'Abfangversuch abgebrochen');
      runtime.options.sectorNpcs.recoverFromCombat(target, 'Flucht gelungen');
      runtime.npcChases.delete(attackerId);
    }
  }
}
