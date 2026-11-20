import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { localMiningCombatArena } from './game-controller-combat';
import { controllerLocalModel } from './game-controller-models';

/** Enter the native duel from a mining map while keeping nearby wreck obstacles. */
export function startPlayerMiningCombat(context: ControllerRuntimeContext, id: string): void {
  const { state } = context;
  state.selectedNpcId = id;
  const local = state.localSpace?.getSnapshot();
  const target =
    state.localNpcMining?.ships.find((entry) => entry.npcId === id) ??
    context.economy.localPirates
      .get(local?.instance.sourceLocationId ?? '')
      ?.snapshot(context.economy.sectorNpcs.npcs)
      .find((entry) => entry.npcId === id);
  if (!local || !target) return;
  const arena = localMiningCombatArena(
    local.instance,
    state.localSpace!.getShipWorldVelocity(),
    fieldWorldFor(context).combatWrecks(local.instance.sourceLocationId)
  );
  const started = context.engagements.engageNpcInArena(id, {
    ...arena,
    defenderPosition: { ...target.position },
    defenderHeadingRadians: target.headingRadians,
    defenderVelocity: {
      x: Math.cos(target.headingRadians) * target.speed,
      y: Math.sin(target.headingRadians) * target.speed,
    },
  });
  if (started) {
    state.embeddedCombat = 'local-space';
    context.systemLog.write('COMBAT > GEFECHT IM ASTEROIDENFELD');
    state.panels.local?.update(controllerLocalModel(context));
  }
}
