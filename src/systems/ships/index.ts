export {
  getAllShipDefinitions,
  getShipDefinition,
  getShipGameplayStats,
  getShipsByRole,
} from './ship-registry';
export {
  calculateShipEnergy,
  componentCargoBonus,
  componentHullBonus,
  componentShieldBonus,
  engineSpeedMultiplier,
  getCompatibleShipComponents,
  getShipComponent,
  miningYieldMultiplier,
  salvageChanceBonus,
  salvageYieldMultiplier,
  sensorRangeMultiplier,
} from './ship-component-service';
export {
  defaultInstalledShipComponents,
  resolveShipMiningSetup,
} from './ship-mining-capability';
export {
  calculateStationSkill,
  crewInjuryFactor,
  stationFactor,
  stationReduction,
} from './station-performance';
export {
  resolveShipGameplayStats,
  shipHullMaxHp,
  shipRoleGameplayProfile,
  shipShieldMaxHp,
} from './ship-stats';

export type {
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipGameplayOverrides,
  ShipGameplayProfile,
  ShipHardpoint,
  ShipHardpoints,
  ShipManeuverThruster,
  ShipPivot,
  ShipRole,
  ShipShieldGeometry,
  ShipSpecialCargoKind,
  ShipSpecialCargoProfile,
  ShipSprite,
  ShipStationDefinition,
  ShipStationSkill,
} from '../../core/ship-types';
export type { InstalledShipComponents, ShipEnergySnapshot } from './ship-component-service';
export type { ShipMiningSetup } from './ship-mining-capability';
export type {
  CrewInjuryState,
  ShipCrewMember,
  ShipStationAssignments,
} from './station-performance';
