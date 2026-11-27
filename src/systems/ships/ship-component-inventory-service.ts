import { playerCargoFree } from '../../core/player-cargo';
import { wholeQuantity as finiteTons } from '../../core/economy-quantity';
import type { PlayerEconomyState } from '../../core/economy-types';
import type { LooseShipComponent, ShipComponentType } from '../../core/ship-types';
import { getShipComponent } from './ship-component-service';

export function looseComponentCargoTons(tier: number): number {
  return 8 + Math.max(1, Math.floor(tier)) * 4;
}

export interface ShipComponentInventorySnapshot {
  readonly serial: number;
  readonly components: readonly LooseShipComponent[];
}

export interface ShipComponentInventoryService {
  snapshot(): ShipComponentInventorySnapshot;
  list(): readonly LooseShipComponent[];
  cargoUsedTons(): number;
  take(uid: string): LooseShipComponent | null;
  store(
    type: ShipComponentType,
    componentId: string,
    sourceWreckId: string,
    cargoCapacityTons: number,
    source?: 'salvage' | 'removed' | 'purchased' | 'campaign'
  ): LooseShipComponent | null;
}

export function createShipComponentInventoryService(
  player: PlayerEconomyState,
  restored?: ShipComponentInventorySnapshot
): ShipComponentInventoryService {
  const components: LooseShipComponent[] = restored?.components.map((item) => ({ ...item })) ?? [];
  let serial = restored?.serial ?? 0;

  return {
    snapshot() {
      return { serial, components: components.map((component) => ({ ...component })) };
    },
    list() {
      return components.map((component) => ({ ...component }));
    },

    cargoUsedTons() {
      return components.reduce((sum, component) => sum + component.cargoTons, 0);
    },

    take(uid) {
      const index = components.findIndex((component) => component.uid === uid);
      if (index < 0) return null;
      const [removed] = components.splice(index, 1);
      player.reservedCargoTons = Math.max(
        0,
        finiteTons(player.reservedCargoTons ?? 0) - (removed?.cargoTons ?? 0)
      );
      return removed ?? null;
    },

    store(type, componentId, sourceWreckId, cargoCapacityTons, source = 'salvage') {
      const definition = getShipComponent(type, componentId);
      if (!definition) return null;
      const cargoTons = looseComponentCargoTons(definition.tier);
      if (cargoTons > playerCargoFree(player, cargoCapacityTons)) return null;

      serial += 1;
      const recovered: LooseShipComponent = {
        uid: `loose-${serial}-${sourceWreckId}`,
        type,
        componentId,
        name: definition.name,
        tier: definition.tier,
        cargoTons,
        sourceWreckId,
        source,
      };
      components.push(recovered);
      player.reservedCargoTons = finiteTons(player.reservedCargoTons ?? 0) + cargoTons;
      return recovered;
    },
  };
}

/** Stage loose cargo without calling store(), which would reserve its tonnage again. */
export function stageCareerShipComponentInventory(
  snapshot: ShipComponentInventorySnapshot,
  player: PlayerEconomyState
): ShipComponentInventoryService {
  if (
    !snapshot ||
    !Number.isSafeInteger(snapshot.serial) ||
    snapshot.serial < 0 ||
    !Array.isArray(snapshot.components)
  ) {
    throw new Error('Invalid loose component checkpoint');
  }
  const uids = new Set<string>();
  let cargoTons = 0;
  for (const item of snapshot.components) {
    if (!item || typeof item.uid !== 'string' || uids.has(item.uid)) {
      throw new Error('Invalid loose component UID');
    }
    const definition = getShipComponent(item.type, item.componentId);
    if (
      !definition ||
      item.name !== definition.name ||
      item.tier !== definition.tier ||
      item.cargoTons !== looseComponentCargoTons(definition.tier) ||
      typeof item.sourceWreckId !== 'string' ||
      (item.source !== undefined &&
        !['salvage', 'removed', 'purchased', 'campaign'].includes(item.source))
    ) {
      throw new Error('Invalid loose component');
    }
    const match = /^loose-(\d+)-/.exec(item.uid);
    if (!match || Number(match[1]) > snapshot.serial) {
      throw new Error('Invalid loose component serial');
    }
    uids.add(item.uid);
    cargoTons += item.cargoTons;
  }
  if (cargoTons > finiteTons(player.reservedCargoTons ?? 0)) {
    throw new Error('Loose component reservation exceeds player cargo reservation');
  }
  return createShipComponentInventoryService(player, snapshot);
}
