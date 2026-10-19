import type { ShipArmorProtection } from '../../core/ship-types';
import type { AsteroidPhysics } from '../../core/local-space-types';
import type {
  SalvageDebrisVariant,
  SalvageSectionVariant,
  SalvageContainerVariant,
} from '../../core/salvage-types';
import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';

import type { ShieldImpactEffect } from '../../core/shield-types';

import type { ShipWeaponFamily } from '../../core/ship-types';

import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import type { CombatPowerBudget } from './combat-power-types';
export type StrategicCombatSide = 'attacker' | 'defender';
export type CombatOutcomeReason = 'destruction' | 'escape' | 'boarding' | 'surrender';

export type CombatTactic = 'fight' | 'kite' | 'flee' | 'minefield';

export type CombatTargetSubsystem = 'hull' | 'engine' | 'tractor';

export interface CombatSubsystemHealth {
  readonly engine: number;
  readonly tractor: number;
  readonly maximum: number;
}

export type CombatDoctrine =
  | 'shield_breaker'
  | 'hull_breaker'
  | 'range_control'
  | 'broadside'
  | 'engine_intercept'
  | 'minefield'
  | 'tractor_intercept'
  | 'escape';

export type CombatPlanPhase = 'reach_range' | 'align_weapons' | 'fire' | 'regroup';

export interface CombatLogEntry {
  readonly timeSeconds: number;
  readonly side: StrategicCombatSide | 'system';
  readonly event: 'start' | 'plan' | 'phase' | 'state' | 'impact' | 'action' | 'result';
  readonly detail: string;
}

export interface CombatStrategyPlan {
  readonly doctrine?: CombatDoctrine;
  readonly phase?: CombatPlanPhase;
  readonly targetSubsystem?: CombatTargetSubsystem;
  readonly broadsideFacing?: 'port' | 'starboard';
  readonly kind:
    'frontal' | 'broadside' | 'skirmish' | 'minefield' | 'tractor_lock' | 'approach' | 'escape';
  readonly focus: 'forward' | 'broadside' | 'turret' | 'mine';
  readonly desiredRange: number;
  readonly score: number;
  readonly reason: string;
}

export type CombatImpactLayer = 'shield' | 'hull' | 'miss' | 'obstacle';

export type CombatProjectileKind = 'plasma' | 'missile' | 'autocannon';

export type CombatBeamKind = 'laser' | 'rail' | 'tractor';

export interface CombatPoint {
  readonly x: number;
  readonly y: number;
}

export interface CombatWeaponMount {
  readonly slotIndex: number;
  readonly x: number;
  readonly y: number;
  readonly facing: 'port' | 'starboard' | 'forward';
  readonly arcDegrees?: number;
  readonly allowedMounts?: readonly ('forward' | 'broadside' | 'turret' | 'guided')[];
  readonly allowedFamilies?: readonly ShipWeaponFamily[];
}

export interface CombatGrapple {
  readonly owner: StrategicCombatSide;
  readonly success: boolean;
  readonly elapsed: number;
  readonly duration: number;
  readonly origin: CombatPoint;
  readonly target: CombatPoint;
  readonly resolved: boolean;
  /** Maximum separation allowed by the winch after the hook attaches. */
  readonly ropeLength: number;
  readonly tension: number;
  readonly tractorAssisted: boolean;
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
  readonly armor?: ShipArmorProtection;
  readonly power?: CombatPowerBudget;
  readonly weapons: readonly ShipComponentDefinition[];
  readonly weaponMounts?: readonly CombatWeaponMount[];
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
  /** Industrial cargo/rock/mine handling; normal maneuver/boarding tractors cannot throw. */
  readonly tractorCanManipulateObjects?: boolean;
  readonly sensorCrewSkill?: number;
  readonly sensorTier?: number;
  readonly sensorRangeMeters?: number;
  readonly sensorRangeMultiplier?: number;
  readonly aiControlled?: boolean;
  readonly aiAggression?: number;
  readonly factionId?: 'civilian' | 'pirates' | 'pirates2';
  readonly pirateMark?: 'broken-spear' | 'black-tide';
}

export interface WeaponTelemetry {
  readonly slotIndex: number;
  readonly weaponId: string;
  readonly weaponName: string;
  shotsFired: number;
  shieldDamageDealt: number;
  hullDamageDealt: number;
  lastFiredAt: number | null;
}

export interface WeaponTelemetrySnapshot extends Readonly<WeaponTelemetry> {
  readonly cooldownRemaining: number;
  readonly cooldownSeconds: number;
  readonly mountLabel: string;
  readonly displayOrder: number;
}

export interface StrategicCombatantSnapshot {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldMaxHp: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
  readonly subsystems: CombatSubsystemHealth;
  readonly position: CombatPoint;
  readonly velocity: CombatPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust?: number;
  readonly longitudinalThrust?: number;
  readonly boostSeconds: number;
  readonly boostActive: boolean;
  readonly boostCooldownSeconds: number;
  readonly power?: CombatPowerBudget;
  readonly powerFault?: 'weapons' | 'total';
  readonly combatIntent?: string;
  readonly ramPhase?: 'flank' | 'impact';
  readonly ramImpactAt?: number;
  readonly mineCount: number;
  readonly readyWeapons: number;
  readonly installedWeapons: number;
  readonly weaponTelemetry: readonly WeaponTelemetrySnapshot[];
  readonly tractorRangeMeters: number;
  readonly tactic: CombatTactic;
  readonly strategy: CombatStrategyPlan | null;
  readonly nextStrategyReviewAt: number;
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
  readonly origin: CombatPoint;
  readonly position: CombatPoint;
  readonly target: CombatPoint;
  readonly ttlSeconds: number;
  readonly direction: CombatPoint;
  readonly missed?: boolean;
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
  readonly missed?: boolean;
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
  readonly subsystem?: CombatTargetSubsystem;
  readonly position: CombatPoint;
  readonly damage: number;
  readonly weaponKind?: CombatProjectileKind | CombatBeamKind;
  readonly weaponFamily?: ShipWeaponFamily;
  readonly source?: 'tractor_asteroid';
}

export interface ThrownAsteroidSnapshot {
  readonly debrisVariant?: SalvageDebrisVariant;
  readonly sectionVariant?: SalvageSectionVariant;
  readonly containerVariant?: SalvageContainerVariant;
  readonly rotation3d?: Readonly<{ x: number; y: number; z: number }>;
  readonly effectSeed?: number;
  readonly owner: StrategicCombatSide;
  readonly asteroidId: string;
  readonly mineDefinition?: ShipMineDefinition;
  readonly position: CombatPoint;
  readonly radius: number;
  readonly collisionRadius?: number;
  readonly velocity: CombatPoint;
  readonly ageSeconds: number;
  readonly phase: 'capture' | 'charge' | 'flight';
  readonly origin: CombatPoint;
}

export interface StrategicCombatSnapshot {
  readonly attacker: StrategicCombatantSnapshot;
  readonly defender: StrategicCombatantSnapshot;
  readonly elapsedSeconds: number;
  readonly exitPoint: CombatPoint;
  readonly winner: StrategicCombatSide | null;
  readonly outcomeReason?: CombatOutcomeReason | null;
  readonly boardingInitiator: StrategicCombatSide | null;
  readonly grapple: CombatGrapple | null;
  readonly grappleUsed: Readonly<Record<StrategicCombatSide, boolean>>;
  readonly lastEvent: string;
  readonly combatLog: readonly CombatLogEntry[];
  readonly projectiles: readonly CombatProjectileSnapshot[];
  readonly beams: readonly CombatBeamSnapshot[];
  readonly mines: readonly CombatMineSnapshot[];
  readonly thrownAsteroids: readonly ThrownAsteroidSnapshot[];
  readonly lastImpact: CombatImpactSnapshot | null;
  readonly recentImpacts: readonly CombatImpactSnapshot[];
  readonly arena: {
    readonly width: number;
    readonly height: number;
    readonly obstacles?: readonly StrategicCombatObstacle[];
    readonly asteroids?: readonly CombatVisualAsteroid[];
  };
}

export interface CombatVisualAsteroid {
  readonly debrisVariant?: SalvageDebrisVariant;
  readonly sectionVariant?: SalvageSectionVariant;
  readonly containerVariant?: SalvageContainerVariant;
  rotation3d?: { x: number; y: number; z: number };
  readonly spin3d?: Readonly<{ x: number; y: number; z: number }>;
  readonly effectSeed?: number;
  readonly id: string;
  readonly position: { x: number; y: number };
  readonly velocity: CombatPoint;
  readonly angularVelocity: number;
  readonly physics?: AsteroidPhysics;
  readonly radius: number;
  /** Solid contact radius, separate from the nominal visual envelope. */
  readonly collisionRadius?: number;
  rotation: number;
  readonly kind: 'resource' | 'debris';
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
  readonly attackerVelocity?: CombatPoint;
  readonly defenderVelocity?: CombatPoint;
  readonly attackerHeadingRadians?: number;
  readonly defenderHeadingRadians?: number;
  readonly obstacles?: readonly StrategicCombatObstacle[];
  readonly asteroids?: readonly CombatVisualAsteroid[];
  readonly exitPoint?: CombatPoint;
}

export interface StrategicCombatService {
  getSnapshot(): StrategicCombatSnapshot;
  getCombatLog(): readonly CombatLogEntry[];
  tick(deltaSeconds: number): StrategicCombatSnapshot;
  setTactic(side: StrategicCombatSide, tactic: CombatTactic): void;
  surrender(side: StrategicCombatSide): void;
  fireGrapple(side: StrategicCombatSide): boolean;
}

export interface MutableCombatant {
  readonly setup: StrategicCombatantSetup;
  readonly shieldMaxHp: number;
  readonly hullMaxHp: number;
  readonly cooldowns: number[];
  readonly weaponTelemetry: WeaponTelemetry[];
  /** Next permitted coordinated firing decision. Individual reloads remain authoritative. */
  nextFireDecisionAt?: number;
  /** Round-robin tie-breaker for identical gun mounts. */
  lastFiredWeaponIndex?: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  headingRadians: number;
  speed: number;
  turnRateRadiansPerSecond: number;
  angularThrust: number;
  lateralThrust?: number;
  longitudinalThrust?: number;
  boostSeconds?: number;
  boostActive?: boolean;
  powerStress?: number;
  powerFaultRemaining?: number;
  powerFault?: 'weapons' | 'total';
  combatIntent?: string;
  /** Alternate escape gate selected only when the current gate is blocked. */
  escapeGate?: CombatPoint;
  /** Stable side while clearing an enemy hull on the escape corridor. */
  escapeAvoidanceSide?: -1 | 1;
  /** Stable approach side and impact commitment for autonomous ramming. */
  ramApproach?: { side: -1 | 1; phase: 'flank' | 'impact' };
  ramImpactAt?: number;
  /** Current geometric flyby, owned only by the ship's tactical flight controller. */
  flightPass?: {
    readonly direction: CombatPoint;
    readonly focus?: CombatStrategyPlan['focus'];
    readonly broadsideFacing?: CombatStrategyPlan['broadsideFacing'];
    /** Stable world-space commitment point along the chosen attack lane. */
    readonly destination?: CombatPoint;
    readonly startRange: number;
    closestRange: number;
    ageSeconds: number;
  };
  boostRampSeconds?: number;
  boostCooldownSeconds?: number;
  tactic: CombatTactic;
  strategy: CombatStrategyPlan | null;
  nextStrategyReviewAt: number;
  lastPlanPhaseChangeAt?: number;
  combatTacticLocked?: boolean;
  nextCommitmentReviewAt?: number;
  escapeCommittedAt?: number;
  escapeAbandonedAt?: number;
  lastEnemyHpObserved?: number;
  lastProgressAt?: number;
  lastContactReviewAt?: number;
  nextAsteroidRouteAt?: number;
  asteroidRoute?: { x: number; y: number }[];
  stalledPlanKind?: CombatStrategyPlan['kind'];
  stalledPlanFacing?: CombatStrategyPlan['broadsideFacing'];
  shieldHp: number;
  hullHp: number;
  subsystems: { engine: number; tractor: number; maximum: number };
  shieldImpacts: ShieldImpactEffect[];
  mineStock: ShipMineDefinition[];
  mineCooldown: number;
  /** Brief window after a real enemy tractor action, not mere tractor ownership. */
  tractorThreatenedUntil?: number;
  tractorPulseCooldown?: number;
  tractorThrowCooldown?: number;
}

export interface MutableProjectile {
  id: number;
  weaponIndex?: number;
  owner: StrategicCombatSide;
  kind: CombatProjectileKind;
  family: ShipWeaponFamily;
  origin: { x: number; y: number };
  position: { x: number; y: number };
  target: StrategicCombatSide;
  speed: number;
  direction: { x: number; y: number };
  ttlSeconds: number;
  shieldDamage: number;
  hullDamage: number;
  critical: boolean;
  missed?: boolean;
  targetSubsystem?: CombatTargetSubsystem;
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
  missed?: boolean;
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

export interface MutableThrownAsteroid {
  readonly debrisVariant?: SalvageDebrisVariant;
  readonly sectionVariant?: SalvageSectionVariant;
  readonly containerVariant?: SalvageContainerVariant;
  readonly rotation3d?: Readonly<{ x: number; y: number; z: number }>;
  readonly effectSeed?: number;
  owner: StrategicCombatSide;
  asteroidId: string;
  mineDefinition?: ShipMineDefinition;
  position: { x: number; y: number };
  radius: number;
  collisionRadius?: number;
  velocity: CombatPoint;
  ageSeconds: number;
  phase: 'capture' | 'charge' | 'flight';
  origin: CombatPoint;
}

export interface StrategicCombatRuntime {
  readonly arena: StrategicCombatArenaOptions;
  readonly attacker: MutableCombatant;
  readonly defender: MutableCombatant;
  readonly random: () => number;
  readonly projectiles: MutableProjectile[];
  readonly beams: MutableBeam[];
  readonly mines: MutableMine[];
  readonly thrownAsteroids: MutableThrownAsteroid[];
  elapsedSeconds: number;
  lastRamImpactAt?: number;
  winner: StrategicCombatSide | null;
  outcomeReason?: CombatOutcomeReason | null;
  boardingInitiator: StrategicCombatSide | null;
  grapple: CombatGrapple | null;
  grappleUsed: Record<StrategicCombatSide, boolean>;
  lastEvent: string;
  combatLog: CombatLogEntry[];
  firstPlanner: StrategicCombatSide;
  lastLoggedImpact: number;
  lastLoggedSampleSecond: number;
  projectileSerial: number;
  beamSerial: number;
  mineSerial: number;
  impactSerial: number;
  lastImpact: CombatImpactSnapshot | null;
  recentImpacts: CombatImpactSnapshot[];
}
