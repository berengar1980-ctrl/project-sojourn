import type {
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipStationSkill,
} from '../../core/ship-types';
import { crewSkillEffects, type CrewSkillEffects } from '../crew/crew-skill-effects';
import type { ShipComponentType } from '../../data/ships/ship-component-catalog';
import {
  calculateShipEnergy,
  componentCargoBonus,
  componentHullBonus,
  componentShieldBonus,
  getShipComponent,
  sensorRangeMultiplier,
  type InstalledShipComponents,
  type ShipEnergySnapshot,
} from './ship-component-service';
import {
  defaultInstalledShipComponents,
  resolveShipMiningSetup,
  type ShipMiningSetup,
} from './ship-mining-capability';
import { resolveShipSalvageSetup, type ShipSalvageSetup } from './ship-salvage-capability';
import { resolveShipGameplayStats, shipHullMaxHp, shipShieldMaxHp } from './ship-stats';
import {
  calculateStationSkill,
  type ShipCrewMember,
  type ShipStationAssignments,
} from './station-performance';

const COMPONENT_TYPES: readonly ShipComponentType[] = [
  'reactor',
  'engine',
  'shield',
  'hull',
  'sensor',
  'weapon',
  'cargo',
  'mining',
  'salvage',
];

export interface ShipRuntimeOptions {
  readonly installed?: InstalledShipComponents;
  readonly crew?: readonly ShipCrewMember[];
  readonly assignments?: ShipStationAssignments;
  readonly manningFactor?: number;
  readonly commandBonus?: number;
}

export interface ShipRuntimeSetup {
  readonly stats: ResolvedShipGameplayStats;
  readonly installed: InstalledShipComponents;
  readonly energy: ShipEnergySnapshot;
  readonly mining: ShipMiningSetup;
  readonly salvage: ShipSalvageSetup;
  readonly stationSkills: Readonly<Record<ShipStationSkill, number>>;
  readonly crewEffects: CrewSkillEffects;
  readonly miningCrewSkill: number;
  readonly salvageCrewSkill: number;
  readonly cargoCapacityTons: number;
  readonly hullMaxHp: number;
  readonly shieldMaxHp: number;
  readonly shieldModifier: number;
  readonly scanAvailable: boolean;
  readonly sensorModifier: number;
  readonly sensorCrewSkill: number;
}

function compatibleInstalledComponents(
  installed: InstalledShipComponents,
  maxTier: number
): InstalledShipComponents {
  const compatible: Partial<Record<ShipComponentType, readonly string[]>> = {};

  for (const type of COMPONENT_TYPES) {
    const ids = (installed[type] ?? []).map((id) => {
      const component = getShipComponent(type, id);
      return component !== null && component.tier <= maxTier ? id : '';
    });
    if (ids.some(Boolean)) compatible[type] = ids;
  }

  return compatible;
}

export function resolveShipRuntimeSetup(
  ship: ShipDefinition,
  options: ShipRuntimeOptions = {}
): ShipRuntimeSetup {
  const stats = resolveShipGameplayStats(ship);
  const installed = compatibleInstalledComponents(
    options.installed ?? defaultInstalledShipComponents(ship),
    stats.maxComponentTier
  );
  const energy = calculateShipEnergy(installed);
  const stationSkills = Object.fromEntries(
    (
      [
        'piloting',
        'sensors',
        'weapons',
        'engineering',
        'salvage',
        'mining',
        'logistics',
      ] as const satisfies readonly ShipStationSkill[]
    ).map((skill) => [
      skill,
      calculateStationSkill(
        stats.stations,
        options.assignments ?? {},
        options.crew ?? [],
        skill,
        options.manningFactor ?? 1,
        options.commandBonus ?? 0
      ),
    ])
  ) as Readonly<Record<ShipStationSkill, number>>;
  const effectSkills: Readonly<Record<ShipStationSkill, number>> = {
    ...stationSkills,
    logistics: stats.stations.some((station) => station.skill === 'logistics')
      ? stationSkills.logistics
      : 0,
  };
  const effects = crewSkillEffects(effectSkills);
  const sensorCrewSkill = stationSkills.sensors;
  const salvageCrewSkill = stationSkills.salvage;
  const scanAvailable =
    (installed.sensor?.length ?? 0) > 0 && energy.output > 0 && energy.baseFree >= 0;

  return {
    stats,
    installed,
    energy,
    mining: resolveShipMiningSetup(ship, installed),
    salvage: resolveShipSalvageSetup(ship, installed),
    stationSkills,
    crewEffects: effects,
    miningCrewSkill: stationSkills.mining,
    salvageCrewSkill,
    cargoCapacityTons: Math.max(0, stats.cargoCapacityTons + componentCargoBonus(installed)),
    hullMaxHp: shipHullMaxHp(ship, componentHullBonus(installed)),
    shieldMaxHp: Math.max(1, shipShieldMaxHp(ship) + componentShieldBonus(installed)),
    shieldModifier: ship.sprite.hardpoints.shield.modifier,
    scanAvailable,
    sensorModifier: scanAvailable ? sensorRangeMultiplier(installed) : 0,
    sensorCrewSkill,
  };
}
