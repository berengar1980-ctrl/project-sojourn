import { createPlayerProfile } from '../core/player-profile';
import { createShipOwnershipService } from '../systems/ships';
import type { ControllerEconomy } from './game-controller-economy';
import type { GameControllerOptions } from './game-controller-types';
import type { ControllerRuntimeState } from './game-controller-runtime-types';

/** Single source of truth for initial player/scene state. */
export function createInitialControllerState(
  options: GameControllerOptions,
  economy: ControllerEconomy
): ControllerRuntimeState {
  return {
    activeShip: options.ship,
    starterShipId: options.restoredSession ? 'salvage-100m-variant-01' : options.ship.id,
    playerProfile: createPlayerProfile(options.playerProfile),
    shipOwnership:
      options.restoredSession?.commerce.ships.ownership ??
      createShipOwnershipService(options.ship.id, economy.trade),
    mode: 'star-map',
    panels: { star: null, local: null, port: null },
    shipSwitcher: null,
    localSpace: null,
    localNpcMining: null,
    salvageScene: null,
    combatPanel: null,
    boardingPanel: null,
    embeddedCombat: null,
    combatResultPending: false,
    combatReengageSeconds: 0,
    selectedNpcId: null,
    localSpaceSeed: 0,
    salvageSpaceSeed: 0,
    salvageEventFields: new Map(),
    visitCounter: 0,
    previousLocationId: options.navigation.getSnapshot().currentLocationId,
    displayedWorldId: '',
  };
}
