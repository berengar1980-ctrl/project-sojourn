import type { LooseShipComponent, ShipComponentType, ShipDefinition } from '../../core/ship-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import {
  getShipComponent,
  salvagedComponentAppraisal,
  type InstalledShipComponents,
} from '../../systems/ships';

export interface PortShipComponentSlotView {
  readonly key: string;
  readonly type: ShipComponentType;
  readonly typeLabel: string;
  readonly index: number;
  readonly componentId: string | null;
  readonly name: string;
  readonly tier: number | null;
  readonly power: number;
  readonly weaponSlot: boolean;
}

export interface PortShipStateInput {
  readonly installed: InstalledShipComponents;
  readonly weaponSlots: number;
  readonly reactorOutput: number;
  readonly combatPowerUsed: number;
  readonly combatPowerFree: number;
  readonly hullMaxHp: number;
  readonly shieldMaxHp: number;
}

export interface PortShipyardLooseComponentView {
  readonly uid: string;
  readonly name: string;
  readonly type: ShipComponentType;
  readonly tier: number;
  readonly cargoTons: number;
  readonly sellValue: number;
  readonly special: boolean;
  readonly modifierLabel: string | null;
}

export interface PortShipyardVariantView {
  readonly id: string;
  readonly type: ShipComponentType;
  readonly name: string;
  readonly tier: number;
  readonly cost: number;
  readonly modifierLabel: string;
}

export interface PortShipyardStateInput {
  readonly loose: readonly LooseShipComponent[];
  readonly variants: readonly ShipComponentDefinition[];
  readonly catalog?: readonly ShipComponentDefinition[];
  readonly ships?: readonly {
    id: string;
    name: string;
    role: string;
    price: number;
    owned: boolean;
  }[];
}

export interface PortShipyardView {
  readonly loose: readonly PortShipyardLooseComponentView[];
  readonly variants: readonly PortShipyardVariantView[];
  readonly catalog: readonly PortShipyardVariantView[];
  readonly ships: readonly {
    id: string;
    name: string;
    role: string;
    price: number;
    owned: boolean;
  }[];
}

const COMPONENT_LABELS: Readonly<Record<ShipComponentType, string>> = {
  reactor: 'Reaktor',
  engine: 'Antrieb',
  shield: 'Schildgenerator',
  hull: 'Hüllenverstärkung',
  sensor: 'Sensoren',
  weapon: 'Waffe',
  cargo: 'Frachtmodul',
  mining: 'Mining-System',
  salvage: 'Bergungssystem',
};

function componentTypesForShip(ship: ShipDefinition): ShipComponentType[] {
  const types: ShipComponentType[] = ['reactor', 'engine', 'shield', 'hull', 'sensor', 'cargo'];
  if (ship.role === 'mining') types.push('mining');
  if (ship.role === 'salvage') types.push('salvage');
  return types;
}

function installedComponentId(
  state: PortShipStateInput,
  type: ShipComponentType,
  index: number
): string | null {
  const ids = state.installed[type];
  if (!ids) return null;
  return ids[index] || null;
}

function componentSlotView(
  type: ShipComponentType,
  index: number,
  componentId: string | null,
  typeLabel: string,
  weaponSlot: boolean
): PortShipComponentSlotView {
  const definition = componentId ? getShipComponent(type, componentId) : null;
  return {
    key: type + '-' + index,
    type,
    typeLabel,
    index,
    componentId,
    name: definition?.name ?? 'LEER',
    tier: definition?.tier ?? null,
    power: definition?.power ?? 0,
    weaponSlot,
  };
}

export function componentSlots(
  ship: ShipDefinition,
  state: PortShipStateInput
): PortShipComponentSlotView[] {
  const slots = componentTypesForShip(ship).map((type) =>
    componentSlotView(type, 0, installedComponentId(state, type, 0), COMPONENT_LABELS[type], false)
  );
  for (let index = 0; index < state.weaponSlots; index += 1) {
    slots.push(
      componentSlotView(
        'weapon',
        index,
        installedComponentId(state, 'weapon', index),
        `Waffenhalterung ${index + 1}`,
        true
      )
    );
  }
  return slots;
}

export function shipyardView(state: PortShipyardStateInput): PortShipyardView {
  return {
    loose: state.loose.map((item) => {
      const definition = getShipComponent(item.type, item.componentId);
      const appraisal = salvagedComponentAppraisal(item.type, item.componentId);
      const modifierLabel =
        definition?.salvageModifier === 'efficiency'
          ? `−${definition.salvageModifierPct ?? 0} % Energie`
          : definition?.salvageModifier === 'damage'
            ? `+${definition.salvageModifierPct ?? 0} % Schaden`
            : null;
      return {
        uid: item.uid,
        name: definition?.name ?? item.name,
        type: item.type,
        tier: item.tier,
        cargoTons: item.cargoTons,
        sellValue: appraisal.sell,
        special: Boolean(definition?.specialSalvage),
        modifierLabel,
      };
    }),
    ships: state.ships ?? [],
    catalog: (state.catalog ?? []).map((component) => ({
      id: component.id,
      type: component.type,
      name: component.name,
      tier: component.tier,
      cost: component.cost,
      modifierLabel:
        component.salvageModifier === 'efficiency'
          ? `−${component.salvageModifierPct ?? 0} % Energie`
          : `+${component.salvageModifierPct ?? 0} % Leistung`,
    })),
    variants: state.variants.map((component) => ({
      id: component.id,
      type: component.type,
      name: component.name,
      tier: component.tier,
      cost: component.cost,
      modifierLabel:
        component.salvageModifier === 'efficiency'
          ? `−${component.salvageModifierPct ?? 0} % Energie`
          : `+${component.salvageModifierPct ?? 0} % Schaden`,
    })),
  };
}
