import type { WorldLocation } from '../core/world-types';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerShipRuntimeOptions } from './game-controller-models';
import { createMiningLocalSpace } from './game-controller-mining';
import { resolveShipRuntimeSetup } from '../systems/ships';

/** Keep original mutable field/traffic objects when returning from boarding. */
export function ensureMiningCombatWorld(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  preserveField: boolean
): void {
  const { state, economy } = context;
  if (preserveField && state.localSpace && state.localNpcMining) return;
  state.localSpace = createMiningLocalSpace(
    state.activeShip,
    state.localSpaceSeed,
    economy.mining,
    location,
    controllerShipRuntimeOptions(context, state.activeShip),
    context.shipOperations.snapshot(
      state.activeShip,
      resolveShipRuntimeSetup(
        state.activeShip,
        controllerShipRuntimeOptions(context, state.activeShip)
      ).hullMaxHp
    ).hullHp,
    (message) => context.systemLog.write(message),
    economy.asteroidClaims
  );
  state.localNpcMining = createNpcLocalMiningService({
    locationId: location.id,
    seed: state.localSpaceSeed,
    width: state.localSpace.getSnapshot().instance.width,
    height: state.localSpace.getSnapshot().instance.height,
    miners: economy.sectorNpcs.npcs.filter(
      (npc) => npc.job === 'miner' && npc.workLocationId === location.id
    ),
    getAsteroids: () => state.localSpace?.getSnapshot().instance.asteroids ?? [],
    mine: (npc, resourceId, requested) => economy.npcs.mineLocal(npc, resourceId, requested),
    depart: (npc) => economy.npcs.dispatchLoadedWorker(npc),
    playerShip: state.activeShip,
    getPlayerShipState: () => state.localSpace!.getSnapshot().instance.ship,
  });
}
