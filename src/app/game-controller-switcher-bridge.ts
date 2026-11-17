import { mountControllerOperations } from './game-controller-operations';
import { equipDeveloperTestShip } from '../systems/ships/ship-developer-test-loadout';
import { withPlayerShipName } from '../core/player-profile';
import { createControllerShipSwitcher } from './game-controller-ship-switcher';
import { canSwitchSmugglingShip } from './game-controller-customs';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export function mountControllerShipSwitcher(
  context: ControllerRuntimeContext,
  onSceneRefresh: (mode: ControllerRuntimeContext['state']['mode']) => void
): void {
  const { state } = context;
  state.shipSwitcher?.destroy();
  const switcher = createControllerShipSwitcher(
    context.root,
    state.activeShip,
    context.navigation,
    (nextShip) => {
      if (!canSwitchSmugglingShip(context, nextShip)) return;
      equipDeveloperTestShip(nextShip, context.loadouts);
      state.activeShip = withPlayerShipName(nextShip, state.playerProfile, state.starterShipId);
      context.economy.salvageEvents.setPlayerSalvageEligible(nextShip.role === 'salvage');
      context.systemLog.write('TEST > SCHIFF ' + nextShip.name.toUpperCase());
      onSceneRefresh(state.mode);
    }
  );
  const operations = mountControllerOperations(context, () => onSceneRefresh(state.mode));
  state.shipSwitcher = {
    update: switcher.update,
    destroy() {
      switcher.destroy();
      operations.destroy();
    },
  };
}
