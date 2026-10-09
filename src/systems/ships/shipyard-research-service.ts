import type { ShipComponentType } from '../../core/ship-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import {
  createShipyardVariantId,
  getCompatibleShipComponents,
  getShipComponent,
} from './ship-component-service';

export type SalvageModifierKind = 'efficiency' | 'performance';

export interface ShipyardResearchTier {
  readonly efficiency: number;
  readonly performance: number;
}

export interface ShipyardResearchService {
  snapshot(): Readonly<Record<string, ShipyardResearchTier>>;
  registerComponent(type: ShipComponentType, componentId: string): boolean;
  variants(type: ShipComponentType, maxTier: number): readonly ShipComponentDefinition[];
}

export function createShipyardResearchService(): ShipyardResearchService {
  // Keyed by actual component model (including tier and weapon family), not by global Mk tier.
  const discovered = new Map<string, { efficiency: number; performance: number }>();

  return {
    snapshot() {
      return Object.fromEntries(
        [...discovered].map(([id, value]) => [id, { ...value }])
      );
    },

    registerComponent(type, componentId) {
      const component = getShipComponent(type, componentId);
      if (!component?.specialSalvage || !component.salvageModifierPct) return false;
      const modifier = component.salvageModifier;
      if (modifier !== 'efficiency' && modifier !== 'performance') return false;
      const baseId = component.baseId;
      if (!baseId) return false;
      const key = type + ':' + baseId;
      const current = discovered.get(key) ?? { efficiency: 0, performance: 0 };
      if (component.salvageModifierPct <= current[modifier]) return false;
      discovered.set(key, { ...current, [modifier]: component.salvageModifierPct });
      return true;
    },

    variants(type, maxTier) {
      return getCompatibleShipComponents(type, maxTier).flatMap((base) => {
        const highest = discovered.get(type + ':' + base.id);
        if (!highest) return [];
        return (['efficiency', 'performance'] as const).flatMap((modifier) => {
          const pct = highest[modifier];
          if (pct <= 0) return [];
          const id = createShipyardVariantId(type, base.id, modifier, pct);
          const component = id ? getShipComponent(type, id) : null;
          return component ? [component] : [];
        });
      });
    },
  };
}
