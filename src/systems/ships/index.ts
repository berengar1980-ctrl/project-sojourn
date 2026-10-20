export {
  getAllShipDefinitions,
  getShipDefinition,
  getShipGameplayStats,
  getShipsByRole,
} from './ship-registry';
export {
  calculateShipEnergy,
  calculateShipModeEnergy,
  componentCargoBonus,
  componentHullBonus,
  componentShieldBonus,
  engineSpeedMultiplier,
  resolveShipArmorProtection,
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
export {
  isShipCombatWeaponSlotActive,
  shipActiveCombatWeaponMounts,
  shipHasIndustrialTractor,
  shipCombatTractorRange,
  STANDARD_MANEUVER_TRACTOR_RANGE_METERS,
} from './ship-combat-role-policy';
export { defaultInstalledShipComponents, resolveShipMiningSetup } from './ship-mining-capability';
export { resolveShipSalvageSetup } from './ship-salvage-capability';
export {
  createShipComponentInventoryService,
  looseComponentCargoTons,
} from './ship-component-inventory-service';
export {
  createShipLoadoutService,
  fitsWeaponHardpoint,
  shipCanFitWeapon,
} from './ship-loadout-service';
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
  resolveShipCombatMovementStats,
  resolveShipLocalCruiseSpeed,
  shipHullMaxHp,
  shipRoleGameplayProfile,
  shipShieldMaxHp,
} from './ship-stats';

export type {
  LooseShipComponent,
  ResolvedShipGameplayStats,
  ShipDefinition,
  ShipArmorProtection,
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
export {
  createShipOwnershipService,
  shipPurchasePrice,
  shipActivationBlock,
} from './ship-ownership-service';
export type {
  ShipOwnershipService,
  ShipOwnershipSnapshot,
  ShipActivationBlock,
} from './ship-ownership-service';
