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
  createShipyardVariantId,
  createSpecialSalvageComponentId,
  getCompatibleShipComponents,
  getShipComponent,
  miningYieldMultiplier,
  salvageChanceBonus,
  salvageYieldMultiplier,
  salvagedComponentAppraisal,
  sensorRangeMultiplier,
} from './ship-component-service';
export { canShipCarryResource } from './ship-cargo-policy';
export { defaultInstalledShipComponents, resolveShipMiningSetup } from './ship-mining-capability';
export { resolveShipSalvageSetup } from './ship-salvage-capability';
export {
  createShipComponentInventoryService,
  looseComponentCargoTons,
} from './ship-component-inventory-service';
export { createShipLoadoutService } from './ship-loadout-service';
export { createShipyardResearchService } from './shipyard-research-service';
export { resolveShipRuntimeSetup } from './ship-runtime';
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
  LooseShipComponent,
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
  ShipWeaponFamily,
  ShipWeaponProfile,
  ShipWeaponRole,
} from '../../core/ship-types';
export type { InstalledShipComponents, ShipEnergySnapshot } from './ship-component-service';
export type { ShipComponentInventoryService } from './ship-component-inventory-service';
export type { ShipLoadoutService } from './ship-loadout-service';
export type { ShipMiningSetup } from './ship-mining-capability';
export type { ShipSalvageSetup } from './ship-salvage-capability';
export type { ShipRuntimeOptions, ShipRuntimeSetup } from './ship-runtime';
export type {
  CrewInjuryState,
  ShipCrewMember,
  ShipStationAssignments,
} from './station-performance';

export type { ShipyardResearchService, SalvageModifierKind } from './shipyard-research-service';

export { createShipProgressionSnapshot } from './ship-progression-snapshot';
export type { ShipProgressionSnapshot } from './ship-progression-snapshot';
export type { ShipLoadoutSnapshot } from './ship-loadout-service';
export type { ShipComponentInventorySnapshot } from './ship-component-inventory-service';
