import type { WorldLocation } from '../core/world-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerShipRuntimeOptions } from './game-controller-models';
import { createMiningLocalSpace } from './game-controller-mining';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { resolveShipRuntimeSetup } from '../systems/ships';

/** Keep original mutable field/traffic objects when returning from boarding. */
export function ensureMiningCombatWorld(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  preserveField: boolean
): void {
  const { state, economy } = context;
  if (preserveField && state.localSpace && state.localNpcMining) return;
  const field = fieldWorldFor(context).field(location.id);
  if (!field) return;
  state.localSpaceSeed = field.instance.seed;
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
    economy.asteroidClaims,
    (ownerId) => {
      const owner = state.localNpcMining?.ships.find((ship) => ship.npcId === ownerId);
      const player = state.localSpace?.getSnapshot().instance.ship;
      return Boolean(
        owner &&
        player &&
        Math.hypot(owner.position.x - player.position.x, owner.position.y - player.position.y) < 650
      );
    },
    field.instance
  );
  // Both map rendering and background NPCs reference the same persistent field.
  state.localNpcMining = field.miners;
}
