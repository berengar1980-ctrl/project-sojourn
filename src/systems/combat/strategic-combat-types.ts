import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';

import type { ShieldImpactEffect } from '../../core/shield-types';

import type { ShipWeaponFamily } from '../../core/ship-types';

import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';

export type StrategicCombatSide = 'attacker' | 'defender';

export type CombatTactic = 'fight' | 'kite' | 'flee' | 'minefield';

export type CombatImpactLayer = 'shield' | 'hull' | 'miss' | 'obstacle';

export type CombatProjectileKind = 'plasma' | 'missile' | 'autocannon';

export type CombatBeamKind = 'laser' | 'rail';

export interface CombatPoint {
  readonly x: number;
  readonly y: number;
}

export interface CombatShieldGeometry {
  readonly centerOffset: CombatPoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly modifier: number;
}

export interface StrategicCombatantSetup {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldGeometry?: CombatShieldGeometry;
  readonly hullHp: number;
  readonly weapons: readonly ShipComponentDefinition[];
  readonly hitChance: number;
  readonly dodgeChance: number;
  readonly damageMultiplier: number;
  readonly criticalChance: number;
  readonly cycleTimeMultiplier: number;
  readonly preferredTactic?: CombatTactic;
  readonly combatSpeed?: number;
  readonly turnRateRadiansPerSecond?: number;
  readonly accelerationMetersPerSecond2?: number;
  readonly mines?: readonly ShipMineDefinition[];
  readonly tractorRangeMeters?: number;
  readonly sensorCrewSkill?: number;
  readonly sensorTier?: number;
  readonly sensorRangeMeters?: number;
  readonly sensorRangeMultiplier?: number;
  readonly aiControlled?: boolean;
  readonly aiAggression?: number;
  readonly factionId?: 'civilian' | 'pirates' | 'pirates2';
  readonly pirateMark?: 'broken-spear' | 'black-tide';
}

export interface StrategicCombatantSnapshot {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldMaxHp: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
  readonly position: CombatPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly tactic: CombatTactic;
  readonly tractorLocked?: boolean;
  readonly factionId?: 'civilian' | 'pirates' | 'pirates2';
  readonly pirateMark?: 'broken-spear' | 'black-tide';
  readonly shieldImpacts: readonly ShieldImpactEffect[];
}

export interface CombatProjectileSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly kind: CombatProjectileKind;
  readonly family: ShipWeaponFamily;
  readonly position: CombatPoint;
  readonly target: CombatPoint;
  readonly ttlSeconds: number;
}

export interface CombatBeamSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly kind: CombatBeamKind;
  readonly family: ShipWeaponFamily;
  readonly origin: CombatPoint;
  readonly end: CombatPoint;
  readonly weaponIndex: number;
  readonly ttlSeconds: number;
  readonly maxTtlSeconds: number;
}

export interface CombatMineSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly mineId: string;
  readonly kind: ShipMineDefinition['kind'];
  readonly name: string;
  readonly tier: number;
  readonly position: CombatPoint;
  readonly armed: boolean;
  readonly radius: number;
  readonly detection: MineContactLevel;
}

export interface CombatImpactSnapshot {
  readonly serial: number;
  readonly target: StrategicCombatSide;
  readonly layer: CombatImpactLayer;
  readonly position: CombatPoint;
  readonly damage: number;
}

export interface StrategicCombatSnapshot {
  readonly attacker: StrategicCombatantSnapshot;
  readonly defender: StrategicCombatantSnapshot;
  readonly elapsedSeconds: number;
  readonly exitPoint: CombatPoint;
  readonly winner: StrategicCombatSide | null;
  readonly lastEvent: string;
  readonly projectiles: readonly CombatProjectileSnapshot[];
  readonly beams: readonly CombatBeamSnapshot[];
  readonly mines: readonly CombatMineSnapshot[];
  readonly lastImpact: CombatImpactSnapshot | null;
  readonly arena: {
    readonly width: number;
    readonly height: number;
  };
}

export interface StrategicCombatObstacle {
  readonly id: string;
  readonly position: CombatPoint;
  readonly radius: number;
}

export interface StrategicCombatArenaOptions {
  readonly width: number;
  readonly height: number;
  readonly attackerPosition?: CombatPoint;
  readonly defenderPosition?: CombatPoint;
  readonly obstacles?: readonly StrategicCombatObstacle[];
  readonly exitPoint?: CombatPoint;
}

export interface StrategicCombatService {
  getSnapshot(): StrategicCombatSnapshot;
  tick(deltaSeconds: number): StrategicCombatSnapshot;
  setTactic(side: StrategicCombatSide, tactic: CombatTactic): void;
}

export interface MutableCombatant {
  readonly setup: StrategicCombatantSetup;
  readonly shieldMaxHp: number;
  readonly hullMaxHp: number;
  readonly cooldowns: number[];
  position: { x: number; y: number };
  headingRadians: number;
  speed: number;
  turnRateRadiansPerSecond: number;
  angularThrust: number;
  tactic: CombatTactic;
  shieldHp: number;
  hullHp: number;
  shieldImpacts: ShieldImpactEffect[];
  mineStock: ShipMineDefinition[];
  mineCooldown: number;
}

export interface MutableProjectile {
  id: number;
  owner: StrategicCombatSide;
  kind: CombatProjectileKind;
  family: ShipWeaponFamily;
  position: { x: number; y: number };
  target: StrategicCombatSide;
  speed: number;
  ttlSeconds: number;
  shieldDamage: number;
  hullDamage: number;
  critical: boolean;
}

interface MutableBeam {
  id: number;
  owner: StrategicCombatSide;
  kind: CombatBeamKind;
  family: ShipWeaponFamily;
  origin: CombatPoint;
  end: CombatPoint;
  weaponIndex: number;
  ttlSeconds: number;
  maxTtlSeconds: number;
}

export interface MutableMine {
  id: number;
  owner: StrategicCombatSide;
  position: { x: number; y: number };
  armedSeconds: number;
  pursuitRemaining: number;
  definition: ShipMineDefinition;
}

export interface ShieldSegmentHit {
  readonly point: CombatPoint;
  readonly surfaceAnchor: CombatPoint;
  readonly t: number;
}

export interface StrategicCombatRuntime {
  readonly arena: StrategicCombatArenaOptions;
  readonly attacker: MutableCombatant;
  readonly defender: MutableCombatant;
  readonly random: () => number;
  readonly projectiles: MutableProjectile[];
  readonly beams: MutableBeam[];
  readonly mines: MutableMine[];
  elapsedSeconds: number;
  winner: StrategicCombatSide | null;
  lastEvent: string;
  projectileSerial: number;
  beamSerial: number;
  mineSerial: number;
  impactSerial: number;
  lastImpact: CombatImpactSnapshot | null;
}
