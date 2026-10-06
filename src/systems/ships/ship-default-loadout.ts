import type { ShipDefinition } from '../../core/ship-types';
import type { InstalledShipComponents } from './ship-component-service';

export function defaultInstalledShipComponents(ship: ShipDefinition): InstalledShipComponents {
  const common: InstalledShipComponents = {
    reactor: ['reactor1'],
    engine: ['engine1'],
    shield: ['shield1'],
    sensor: ['sensor1'],
  };

  if (ship.role === 'mining') return { ...common, mining: ['mining1'] };
  if (ship.role === 'salvage') return { ...common, salvage: ['salvage1'] };
  if (ship.role === 'patrol') return { ...common, weapon: ['weapon1'] };
  return common;
}
