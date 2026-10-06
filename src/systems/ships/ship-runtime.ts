import type { ShipDefinition } from '../../core/ship-types';
import {
  calculateShipEnergy,
  componentHullBonus,
  componentShieldBonus,
  sensorRangeMultiplier,
  type InstalledShipComponents,
  type ShipEnergySnapshot,
} from './ship-component-service';
import { resolveShipCargoPolicy, type ShipCargoPolicy } from './ship-cargo-policy';
import { defaultInstalledShipComponents } from './ship-default-loadout';
import { resolveShipMiningSetup, type ShipMiningSetup } from './ship-mining-capability';
import { resolveShipGameplayStats, shipHullMaxHp, shipShieldMaxHp } from './ship-stats';
import {
  calculateStationSkill,
  type ShipCrewMember,
  type ShipStationAssignments,
} from './station-performance';

export interface ShipRuntimeOptions {
  readonly installed?: InstalledShipComponents;
  readonly crew?: readonly ShipCrewMember[];
  readonly assignments?: ShipStationAssignments;
}

export interface ShipRuntimeSetup {
  readonly installed: InstalledShipComponents;
  readonly energy: ShipEnergySnapshot;
  readonly hullMaxHp: number;
  readonly shieldMaxHp: number;
  readonly shieldDamageModifier: number;
  readonly shieldPowered: boolean;
  readonly sensorModifier: number;
  readonly sensorCrewSkill: number;
  readonly miningCrewSkill: number;
  readonly engineeringCrewSkill: number;
  readonly mining: ShipMiningSetup;
  readonly cargo: ShipCargoPolicy;
}

export function resolveShipRuntimeSetup(
  ship: ShipDefinition,
  options: ShipRuntimeOptions = {}
): ShipRuntimeSetup {
  const installed = options.installed ?? defaultInstalledShipComponents(ship);
  const crew = options.crew ?? [];
  const assignments = options.assignments ?? {};
  const stats = resolveShipGameplayStats(ship);
  const energy = calculateShipEnergy(installed);
  const sensorCrewSkill = calculateStationSkill(stats.stations, assignments, crew, 'sensors');
  const miningCrewSkill = calculateStationSkill(stats.stations, assignments, crew, 'mining');
  const engineeringCrewSkill = calculateStationSkill(
    stats.stations,
    assignments,
    crew,
    'engineering'
  );
  const continuousSystemsPowered = energy.output > 0 && energy.baseFree >= 0;
  const shieldPowered =
    continuousSystemsPowered && energy.output >= energy.baseUsed + energy.shieldUsed;

  return {
    installed,
    energy,
    hullMaxHp: shipHullMaxHp(ship, componentHullBonus(installed)),
    shieldMaxHp: shipShieldMaxHp(
      ship,
      ship.sprite.hardpoints.shield.maxHp + componentShieldBonus(installed)
    ),
    shieldDamageModifier: ship.sprite.hardpoints.shield.modifier,
    shieldPowered,
    sensorModifier: continuousSystemsPowered ? sensorRangeMultiplier(installed) : 0.25,
    sensorCrewSkill,
    miningCrewSkill,
    engineeringCrewSkill,
    mining: resolveShipMiningSetup(ship, installed, miningCrewSkill),
    cargo: resolveShipCargoPolicy(ship, installed),
  };
}
