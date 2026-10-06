import type {
  ShipComponentDefinition,
  ShipComponentLoadout,
  ShipComponentType,
  ShipDerivedStats,
  ShipEnergyStats,
  ShipRoleProfile,
} from '../../core/ship-gameplay-types';
import type { ShipDefinition, ShipGameplayModifiers, ShipRole } from '../../core/ship-types';
import {
  shipComponents,
  starterShipComponentIds,
} from '../../data/ships/ship-components';
import { shipRoleProfiles } from '../../data/ships/ship-role-profiles';

const componentById = new Map(shipComponents.map((definition) => [definition.id, definition]));

function multiplier(value: number | undefined): number {
  return value == null ? 1 : Math.max(0.01, value);
}

function integerDelta(value: number | undefined): number {
  return Number.isFinite(value) ? Math.trunc(value ?? 0) : 0;
}

export function getShipRoleProfile(role: ShipRole): ShipRoleProfile {
  return shipRoleProfiles[role];
}

export function getShipComponentDefinition(id: string): ShipComponentDefinition | null {
  return componentById.get(id) ?? null;
}

export function createStarterShipLoadout(ship: ShipDefinition): ShipComponentLoadout {
  const profile = getShipRoleProfile(ship.role);
  const loadout: Partial<Record<ShipComponentType, readonly string[]>> = {};

  for (const [type, count] of Object.entries(profile.componentSlots) as [
    ShipComponentType,
    number,
  ][]) {
    const starterId = starterShipComponentIds[type];
    if (!starterId || count <= 0 || type === 'weapon') continue;
    loadout[type] = Array.from({ length: count }, () => starterId);
  }

  return loadout;
}

export function canInstallShipComponent(ship: ShipDefinition, componentId: string): boolean {
  const component = getShipComponentDefinition(componentId);
  if (!component) return false;
  const profile = getShipRoleProfile(ship.role);
  return (
    profile.componentSlots[component.type] > 0 && component.tier <= profile.maxComponentTier
  );
}

function resolveLoadout(
  ship: ShipDefinition,
  loadout: ShipComponentLoadout
): readonly ShipComponentDefinition[] {
  const profile = getShipRoleProfile(ship.role);
  const resolved: ShipComponentDefinition[] = [];

  for (const [type, ids] of Object.entries(loadout) as [ShipComponentType, readonly string[]][]) {
    if (ids.length > profile.componentSlots[type]) {
      throw new Error('Too many ' + type + ' components for ship ' + ship.id + '.');
    }
    for (const id of ids) {
      const component = getShipComponentDefinition(id);
      if (!component || component.type !== type) {
        throw new Error('Unknown or mismatched ship component: ' + id + '.');
      }
      if (!canInstallShipComponent(ship, id)) {
        throw new Error('Incompatible ship component: ' + id + ' for ' + ship.id + '.');
      }
      resolved.push(component);
    }
  }

  return resolved;
}

function componentsOfType(
  components: readonly ShipComponentDefinition[],
  type: ShipComponentType
): readonly ShipComponentDefinition[] {
  return components.filter((component) => component.type === type);
}

export function calculateShipEnergy(
  ship: ShipDefinition,
  loadout: ShipComponentLoadout
): ShipEnergyStats {
  const components = resolveLoadout(ship, loadout);
  const output = componentsOfType(components, 'reactor').reduce(
    (sum, component) => sum + (component.reactorOutput ?? 0),
    0
  );
  let baseUsed = 0;
  let shieldUsed = 0;
  let weaponsUsed = 0;

  for (const component of components) {
    if (component.type === 'reactor') continue;
    if (component.type === 'shield') shieldUsed += component.powerDraw;
    else if (component.type === 'weapon') weaponsUsed += component.powerDraw;
    else baseUsed += component.powerDraw;
  }

  const combatUsed = baseUsed + shieldUsed + weaponsUsed;
  return {
    output,
    baseUsed,
    baseFree: output - baseUsed,
    shieldUsed,
    weaponsUsed,
    combatUsed,
    combatFree: output - combatUsed,
  };
}

function modifiers(ship: ShipDefinition): ShipGameplayModifiers {
  return ship.gameplay ?? {};
}

export function calculateShipDerivedStats(
  ship: ShipDefinition,
  loadout: ShipComponentLoadout = createStarterShipLoadout(ship)
): ShipDerivedStats {
  const profile = getShipRoleProfile(ship.role);
  const installed = resolveLoadout(ship, loadout);
  const gameplay = modifiers(ship);

  const hullBonus = componentsOfType(installed, 'hull').reduce(
    (sum, component) => sum + (component.hullHpBonus ?? 0),
    0
  );
  const shieldBonus = componentsOfType(installed, 'shield').reduce(
    (sum, component) => sum + (component.shieldHpBonus ?? 0),
    0
  );
  const speedBonus = componentsOfType(installed, 'engine').reduce(
    (sum, component) => sum + (component.speedBonus ?? 0),
    0
  );
  const sensorBonus = componentsOfType(installed, 'sensor').reduce(
    (sum, component) => sum + (component.sensorRangeBonus ?? 0),
    0
  );
  const cargoBonus = componentsOfType(installed, 'cargo').reduce(
    (sum, component) => sum + (component.cargoCapacityBonusTons ?? 0),
    0
  );
  const miningBonus = Math.max(
    0,
    ...componentsOfType(installed, 'mining').map((component) => component.yieldBonus ?? 0)
  );
  const salvageBonus = Math.max(
    0,
    ...componentsOfType(installed, 'salvage').map((component) => component.yieldBonus ?? 0)
  );
  const salvageChanceBonus = Math.max(
    0,
    ...componentsOfType(installed, 'salvage').map((component) => component.chanceBonus ?? 0)
  );

  return {
    hullMax: Math.max(
      1,
      Math.round((profile.hullPoints + hullBonus) * multiplier(gameplay.hullMultiplier))
    ),
    shieldMaxHp: Math.max(
      1,
      Math.round(
        (ship.sprite.hardpoints.shield.maxHp + shieldBonus) *
          multiplier(gameplay.shieldHpMultiplier)
      )
    ),
    shieldModifier:
      ship.sprite.hardpoints.shield.modifier * multiplier(gameplay.shieldModifierMultiplier),
    cruiseSpeed:
      ship.navigation.cruiseSpeed *
      (1 + speedBonus) *
      multiplier(gameplay.cruiseSpeedMultiplier),
    fuelCapacity: profile.fuelCapacity * multiplier(gameplay.fuelCapacityMultiplier),
    fuelUse: profile.fuelUse * multiplier(gameplay.fuelUseMultiplier),
    cargoCapacityTons: Math.max(
      0,
      Math.round(
        (ship.cargoCapacityTons + cargoBonus) * multiplier(gameplay.cargoCapacityMultiplier)
      )
    ),
    sensorRangeMultiplier: 1 + sensorBonus,
    miningYieldMultiplier: 1 + miningBonus,
    salvageYieldMultiplier: 1 + salvageBonus,
    salvageChanceBonus,
    weaponSlots: Math.max(0, profile.weaponSlots + integerDelta(gameplay.weaponSlotDelta)),
    crewCapacity: Math.max(1, profile.crewCapacity + integerDelta(gameplay.crewCapacityDelta)),
    cargoMode: profile.cargoMode,
    energy: calculateShipEnergy(ship, loadout),
  };
}
