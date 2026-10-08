import type { ShipComponentType } from '../../core/ship-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import {
  createShipyardVariantId,
  getCompatibleShipComponents,
  getShipComponent,
} from './ship-component-service';

export type SalvageModifierKind = 'efficiency' | 'damage';

export interface ShipyardResearchTier {
  readonly efficiency: number;
  readonly damage: number;
}

export interface ShipyardResearchService {
  snapshot(): Readonly<Record<number, ShipyardResearchTier>>;
  registerComponent(type: ShipComponentType, componentId: string): boolean;
  variants(type: ShipComponentType, maxTier: number): readonly ShipComponentDefinition[];
}

export function createShipyardResearchService(): ShipyardResearchService {
  const research: Record<number, { efficiency: number; damage: number }> = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [index + 1, { efficiency: 0, damage: 0 }])
  );

  return {
    snapshot() {
      return Object.fromEntries(
        Object.entries(research).map(([tier, value]) => [Number(tier), { ...value }])
      );
    },

    registerComponent(type, componentId) {
      const component = getShipComponent(type, componentId);
      if (
        !component?.specialSalvage ||
        !component.salvageModifier ||
        !component.salvageModifierPct
      ) {
        return false;
      }
      const tier = Math.max(1, Math.min(6, component.tier));
      const current = research[tier]![component.salvageModifier];
      if (component.salvageModifierPct <= current) return false;
      research[tier]![component.salvageModifier] = component.salvageModifierPct;
      return true;
    },

    variants(type, maxTier) {
      return getCompatibleShipComponents(type, maxTier).flatMap((base) => {
        const tier = research[base.tier];
        if (!tier || base.baseId || base.specialSalvage || base.shipyardVariant) return [];
        const ids: string[] = [];
        if (tier.efficiency > 0 && base.power > 0) {
          const id = createShipyardVariantId(type, base.id, 'efficiency', tier.efficiency);
          if (id) ids.push(id);
        }
        if (tier.damage > 0 && type === 'weapon') {
          const id = createShipyardVariantId(type, base.id, 'damage', tier.damage);
          if (id) ids.push(id);
        }
        return ids
          .map((id) => getShipComponent(type, id))
          .filter((component): component is ShipComponentDefinition => component !== null);
      });
    },
  };
}
