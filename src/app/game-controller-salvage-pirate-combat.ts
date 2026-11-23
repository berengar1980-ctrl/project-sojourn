import type { SalvageField } from '../core/salvage-types';
import type { WorldPoint } from '../core/world-types';
import { salvageFieldCombatArena } from '../systems/combat/field-combat-arena';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

function battlePosition(position: WorldPoint) {
  return { x: position.x, y: position.y };
}

export function engageSalvagePirate(
  context: ControllerRuntimeContext,
  field: SalvageField,
  pirateId: string,
  targetId: string,
  piratePosition: WorldPoint,
  targetPosition: WorldPoint
): boolean {
  const arena = salvageFieldCombatArena(field);
  if (targetId === 'player') {
    if (context.engagements.activePlayerCombat()) return false;
    const started = context.engagements.engageNpcInArena(
      pirateId,
      {
        ...arena,
        attackerPosition: battlePosition(targetPosition),
        defenderPosition: battlePosition(piratePosition),
        attackerVelocity: { x: 0, y: 0 },
        defenderVelocity: { x: 0, y: 0 },
      },
      false
    );
    if (started) {
      context.state.embeddedCombat = 'salvage-space';
      context.systemLog.write('PIRATEN > UEBERFALL IM WRACKFELD · KI-KAMPFMODUS');
    }
    return started;
  }
  const started = context.engagements.engageNpcsInArena(pirateId, targetId, {
    ...arena,
    attackerPosition: battlePosition(piratePosition),
    defenderPosition: battlePosition(targetPosition),
    attackerVelocity: { x: 0, y: 0 },
    defenderVelocity: { x: 0, y: 0 },
  });
  if (started) context.systemLog.write('PIRATEN > NPC-GEFECHT IM WRACKFELD');
  return started;
}

export function engageSalvageDronePirate(
  context: ControllerRuntimeContext,
  field: SalvageField,
  pirateId: string,
  piratePosition: WorldPoint,
  dronePosition: WorldPoint
): boolean {
  const droneId = 'security-drone:' + field.sourceLocationId;
  const defender = context.economy.sectorNpcs.npcs.find((npc) => npc.id === droneId);
  const pirate = context.economy.sectorNpcs.npcs.find((npc) => npc.id === pirateId);
  if (
    !defender ||
    defender.hullHp <= 0 ||
    defender.combatMovement ||
    !pirate ||
    pirate.hullHp <= 0 ||
    pirate.combatMovement
  )
    return false;
  const started = context.engagements.engageNpcsInArena(pirateId, droneId, {
    ...salvageFieldCombatArena(field),
    attackerPosition: battlePosition(piratePosition),
    defenderPosition: battlePosition(dronePosition),
    attackerVelocity: { x: 0, y: 0 },
    defenderVelocity: { x: 0, y: 0 },
  });
  if (started) context.systemLog.write('SEC-01 > PIRAT IM WRACKFELD ERKANNT · DIREKTER ANGRIFF');
  return started;
}
