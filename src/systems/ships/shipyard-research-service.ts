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

export function createShipyardResearchService(
  restored: Readonly<Record<string, ShipyardResearchTier>> = {}
): ShipyardResearchService {
  // Keyed by actual component model (including tier and weapon family), not by global Mk tier.
  const discovered = new Map<string, { efficiency: number; performance: number }>(
    Object.entries(restored).map(([key, tier]) => [key, { ...tier }])
  );

  return {
    snapshot() {
      return Object.fromEntries([...discovered].map(([id, value]) => [id, { ...value }]));
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

/** Restore research tiers without replaying salvage rewards or discoveries. */
export function stageCareerShipyardResearch(
  snapshot: Readonly<Record<string, ShipyardResearchTier>>
): ShipyardResearchService {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Invalid shipyard research checkpoint');
  }
  for (const [key, value] of Object.entries(snapshot)) {
    const separator = key.indexOf(':');
    const type = key.slice(0, separator) as ShipComponentType;
    const baseId = key.slice(separator + 1);
    if (
      separator < 1 ||
      !getShipComponent(type, baseId) ||
      !value ||
      !Number.isSafeInteger(value.efficiency) ||
      !Number.isSafeInteger(value.performance) ||
      value.efficiency < 0 ||
      value.efficiency > 100 ||
      value.performance < 0 ||
      value.performance > 100
    ) {
      throw new Error('Invalid shipyard research tier');
    }
  }
  return createShipyardResearchService(snapshot);
}
