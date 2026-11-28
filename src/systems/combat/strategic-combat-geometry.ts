import { COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT } from '../../core/combat-map-dimensions';
import { createWeaponTelemetry } from './combat-weapon-telemetry';
import { weaponCycleSeconds } from './combat-weapon-fire-control';
import { weaponUiOrder, weaponHardpointName } from '../../core/weapon-hardpoint-labels';
import type { ShipHardpoints, ShipWeaponFamily } from '../../core/ship-types';
import { createShieldWorldGeometry } from '../../core/ship-contact-geometry';

import type {
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

export { clamp } from '../../core/numeric-geometry';

export { stableHash as hashSeed } from '../../core/stable-hash';

export { createXorshiftRandom as createRng } from '../../core/seeded-random';

export { distance } from '../../core/field-geometry';

export function createCombatShieldGeometry(
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number
): CombatShieldGeometry {
  const geometry = createShieldWorldGeometry(hardpoints, nominalLengthMeters);
  return {
    centerOffset: geometry.centerOffset,
    radiusX: Math.max(1, geometry.radiusX),
    radiusY: Math.max(1, geometry.radiusY),
    modifier: Math.max(0.01, hardpoints.shield.modifier),
  };
}

export function normalize(dx: number, dy: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  return length <= 0.0001 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

export { wrapAngle } from '../../core/numeric-geometry';

export { rotatePoint as rotate } from '../../core/field-geometry';

function initialManeuveringState(arena: StrategicCombatArenaOptions, side: StrategicCombatSide) {
  const maneuvering = side === 'attacker' ? arena.attackerManeuvering : arena.defenderManeuvering;
  return {
    turnRateRadiansPerSecond: maneuvering?.turnRateRadiansPerSecond ?? 0,
    angularThrust: maneuvering?.angularThrust ?? 0,
    lateralThrust: maneuvering?.lateralThrust ?? 0,
    longitudinalThrust: maneuvering?.longitudinalThrust ?? 0,
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
    get speed() {
      return Math.hypot(this.velocity.x, this.velocity.y);
    },
    ...initialManeuveringState(arena, side),
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
    speed: Math.hypot(combatant.velocity.x, combatant.velocity.y),
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
