import type { ShipDefinition } from '../core/ship-types';
import type { NavigationService } from '../systems/navigation';
import { getAllShipDefinitions, getShipDefinition } from '../systems/ships';
import { createShipTestSwitcher, type ShipTestSwitcher } from '../ui/dev/ship-test-switcher';

export type { ShipTestSwitcher } from '../ui/dev/ship-test-switcher';

export function createControllerShipSwitcher(
  root: HTMLElement,
  activeShip: ShipDefinition,
  navigation: NavigationService,
  onSwitch: (ship: ShipDefinition) => void
): ShipTestSwitcher {
  return createShipTestSwitcher({
    root,
    ships: getAllShipDefinitions(),
    activeShipId: activeShip.id,
    disabled: navigation.getSnapshot().isTravelling,
    onSelect: (shipId) => {
      const nextShip = getShipDefinition(shipId);
      if (!nextShip || nextShip.id === activeShip.id) return;
      navigation.setCruiseSpeed(nextShip.navigation.cruiseSpeed);
      onSwitch(nextShip);
    },
  });
}
