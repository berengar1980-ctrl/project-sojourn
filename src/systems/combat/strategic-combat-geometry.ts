import { COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT } from '../../core/combat-map-dimensions';
import { createWeaponTelemetry } from './combat-weapon-telemetry';
import { weaponCycleSeconds } from './combat-weapon-fire-control';
import { weaponUiOrder, weaponHardpointName } from '../../core/weapon-hardpoint-labels';
import type { ShipHardpoints, ShipWeaponFamily } from '../../core/ship-types';

import type {
  CombatPoint,
  CombatShieldGeometry,
  StrategicCombatantSetup,
  StrategicCombatSide,
  StrategicCombatArenaOptions,
  MutableCombatant,
  StrategicCombatantSnapshot,
  CombatProjectileKind,
  CombatBeamKind,
} from './strategic-combat-types';

export const DEFAULT_ARENA_WIDTH = COMBAT_MAP_WIDTH;

export const DEFAULT_ARENA_HEIGHT = COMBAT_MAP_HEIGHT;

export const EDGE_PADDING = 160;

export const EDGE_WARNING_DISTANCE = 650;

export const MINE_DROP_COOLDOWN = 7.5;

export const DEFAULT_TURN_RATE = 0.72;

export const DEFAULT_ACCELERATION = 34;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function distance(a: CombatPoint, b: CombatPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function createCombatShieldGeometry(
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number
): CombatShieldGeometry {
  const scale = nominalLengthMeters / hardpoints.sourceWidth;
  return {
    centerOffset: {
      x: (hardpoints.shield.centerX - hardpoints.pivot.x) * scale,
      y: (hardpoints.shield.centerY - hardpoints.pivot.y) * scale,
    },
    radiusX: Math.max(1, hardpoints.shield.radiusX * scale),
    radiusY: Math.max(1, hardpoints.shield.radiusY * scale),
    modifier: Math.max(0.01, hardpoints.shield.modifier),
  };
}

export function normalize(dx: number, dy: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  return length <= 0.0001 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

export function wrapAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function rotate(point: CombatPoint, angle: number): CombatPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function createCombatant(
  setup: StrategicCombatantSetup,
  side: StrategicCombatSide,
  arena: StrategicCombatArenaOptions
): MutableCombatant {
  const configured = side === 'attacker' ? arena.attackerPosition : arena.defenderPosition;
  const startX = configured?.x ?? (side === 'attacker' ? arena.width * 0.28 : arena.width * 0.72);
  const startY = configured?.y ?? arena.height * (side === 'attacker' ? 0.46 : 0.54);
  const startingVelocity = side === 'attacker' ? arena.attackerVelocity : arena.defenderVelocity;
  const initialVelocity = startingVelocity ? { ...startingVelocity } : { x: 0, y: 0 };
  const initialHeading =
    side === 'attacker' ? arena.attackerHeadingRadians : arena.defenderHeadingRadians;
  return {
    setup,
    shieldMaxHp: Math.max(0, setup.shieldHp),
    hullMaxHp: Math.max(1, setup.hullHp),
    shieldHp: Math.max(0, setup.shieldHp),
    hullHp: Math.max(1, setup.hullHp),
    subsystems: {
      engine: Math.max(1, setup.hullHp),
      tractor: setup.tractorRangeMeters ? Math.max(1, setup.hullHp) : 0,
      maximum: Math.max(1, setup.hullHp),
    },
    cooldowns: setup.weapons.map((_, index) => 0.7 + index * 0.18),
    weaponTelemetry: createWeaponTelemetry({ setup }),
    position: { x: startX, y: startY },
    velocity: initialVelocity,
    headingRadians: initialHeading ?? (side === 'attacker' ? 0 : Math.PI),
    speed: Math.hypot(initialVelocity.x, initialVelocity.y),
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    boostSeconds: 3.5,
    boostActive: false,
    powerStress: 0,
    powerFaultRemaining: 0,
    boostCooldownSeconds: 0,
    tactic: setup.preferredTactic ?? 'fight',
    strategy: null,
    nextStrategyReviewAt: side === 'attacker' ? 0 : 4,
    shieldImpacts: [],
    mineStock: [...(setup.mines ?? [])],
    mineCooldown: 0,
  };
}

export function snapshot(combatant: MutableCombatant): StrategicCombatantSnapshot {
  return {
    id: combatant.setup.id,
    name: combatant.setup.name,
    shipId: combatant.setup.shipId,
    shieldHp: combatant.shieldHp,
    shieldMaxHp: combatant.shieldMaxHp,
    hullHp: combatant.hullHp,
    hullMaxHp: combatant.hullMaxHp,
    subsystems: { ...combatant.subsystems },
    position: { ...combatant.position },
    velocity: { ...combatant.velocity },
    headingRadians: combatant.headingRadians,
    speed: combatant.speed,
    turnRateRadiansPerSecond: combatant.turnRateRadiansPerSecond,
    angularThrust: combatant.angularThrust,
    lateralThrust: combatant.lateralThrust ?? 0,
    longitudinalThrust: combatant.longitudinalThrust ?? 0,
    boostSeconds: combatant.boostSeconds ?? 3.5,
    boostActive: combatant.boostActive === true,
    ...(combatant.setup.power ? { power: { ...combatant.setup.power } } : {}),
    ...(combatant.powerFault ? { powerFault: combatant.powerFault } : {}),
    ...(combatant.combatIntent !== undefined ? { combatIntent: combatant.combatIntent } : {}),
    ...(combatant.ramApproach ? { ramPhase: combatant.ramApproach.phase } : {}),
    ...(combatant.ramImpactAt !== undefined ? { ramImpactAt: combatant.ramImpactAt } : {}),
    mineCount: combatant.mineStock.length,
    readyWeapons: combatant.cooldowns.filter((seconds) => seconds <= 0).length,
    installedWeapons: combatant.setup.weapons.length,
    weaponTelemetry: combatant.weaponTelemetry.map((entry, index) => {
      const mount = combatant.setup.weaponMounts?.find((point) => point.slotIndex === index);
      const profile = combatant.setup.weapons[index]?.weapon;
      return {
        ...entry,
        cooldownRemaining: combatant.cooldowns[index] ?? 0,
        cooldownSeconds: profile
          ? weaponCycleSeconds(profile, combatant.setup.cycleTimeMultiplier)
          : 0,
        mountLabel: mount ? weaponHardpointName(mount) : 'Waffe',
        displayOrder: mount ? weaponUiOrder(mount) : index,
      };
    }),
    tractorRangeMeters: combatant.setup.tractorRangeMeters ?? 0,
    boostCooldownSeconds: combatant.boostCooldownSeconds ?? 0,
    tactic: combatant.tactic,
    strategy: combatant.strategy ? { ...combatant.strategy } : null,
    nextStrategyReviewAt: combatant.nextStrategyReviewAt,
    ...(combatant.setup.factionId ? { factionId: combatant.setup.factionId } : {}),
    ...(combatant.setup.pirateMark ? { pirateMark: combatant.setup.pirateMark } : {}),
    shieldImpacts: combatant.shieldImpacts.map((impact) => ({ ...impact })),
  };
}

export function weaponKind(
  family: ShipWeaponFamily
): CombatProjectileKind | Exclude<CombatBeamKind, 'tractor'> {
  if (family === 'guided_missile' || family === 'he_missile') return 'missile';
  if (family === 'plasma_battery') return 'plasma';
  if (family === 'railgun') return 'rail';
  if (family === 'autocannon') return 'autocannon';
  return 'laser';
}
