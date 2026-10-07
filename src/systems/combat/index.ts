export { getShipMine, getShipMinesByKind, SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
export { detectShipMine, mineDetectionScore } from './mine-detection-service';
export { resolveShipMineHit } from './mine-damage-service';
export { crewAdjustedShipWeaponProfile, resolveShipWeaponHit } from './ship-weapon-service';

export type {
  LayeredDamageResult,
  MineContactLevel,
  MineDetectionResult,
  MineSensorContext,
  ShipIntegrityState,
  ShipMineDefinition,
  ShipMineKind,
} from '../../core/combat-types';

export {
  createCombatShieldGeometry,
  createStrategicCombatService,
} from './strategic-combat-service';
export type {
  CombatShieldGeometry,
  StrategicCombatService,
  StrategicCombatSnapshot,
  StrategicCombatantSetup,
  StrategicCombatantSnapshot,
  StrategicCombatSide,
} from './strategic-combat-service';

export { createStarMapEngagementService } from './star-map-engagement-service';
export type {
  StarMapEngagementOptions,
  StarMapEngagementService,
} from './star-map-engagement-service';
