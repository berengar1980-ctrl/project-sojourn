import type { PlayerEconomyState } from '../../core/economy-types';
import type { LooseShipComponent, ShipComponentType } from '../../core/ship-types';
import { getShipComponent } from './ship-component-service';

function finiteTons(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function resourceCargoUsed(player: PlayerEconomyState): number {
  return Object.values(player.cargo).reduce((sum, lot) => sum + finiteTons(lot.qty), 0);
}

export function looseComponentCargoTons(tier: number): number {
  return 8 + Math.max(1, Math.floor(tier)) * 4;
}

export interface ShipComponentInventoryService {
  list(): readonly LooseShipComponent[];
  cargoUsedTons(): number;
  store(
    type: ShipComponentType,
    componentId: string,
    sourceWreckId: string,
    cargoCapacityTons: number
  ): LooseShipComponent | null;
}

export function createShipComponentInventoryService(
  player: PlayerEconomyState
): ShipComponentInventoryService {
  const components: LooseShipComponent[] = [];
  let serial = 0;

  return {
    list() {
      return [...components];
    },

    cargoUsedTons() {
      return components.reduce((sum, component) => sum + component.cargoTons, 0);
    },

    store(type, componentId, sourceWreckId, cargoCapacityTons) {
      const definition = getShipComponent(type, componentId);
      if (!definition) return null;
      const cargoTons = looseComponentCargoTons(definition.tier);
      const occupied =
        resourceCargoUsed(player) + finiteTons(player.reservedCargoTons ?? 0);
      if (occupied + cargoTons > finiteTons(cargoCapacityTons)) return null;

      serial += 1;
      const recovered: LooseShipComponent = {
        uid: `loose-${serial}-${sourceWreckId}`,
        type,
        componentId,
        name: definition.name,
        tier: definition.tier,
        cargoTons,
        sourceWreckId,
      };
      components.push(recovered);
      player.reservedCargoTons = finiteTons(player.reservedCargoTons ?? 0) + cargoTons;
      return recovered;
    },
  };
}
