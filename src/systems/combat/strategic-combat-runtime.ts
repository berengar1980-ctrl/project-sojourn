import type { ShipWeaponFamily } from '../../core/ship-types';
import {
  ION_CANNON_ARC_SECONDS,
  RAIL_LANCE_SECONDS,
  VISION_ION_LASER_SECONDS,
  VISION_PULSE_SECONDS,
  VISION_REPEATER_SECONDS,
} from '../../core/combat-visual-timings';

import type {
  StrategicCombatRuntime,
  StrategicCombatSide,
  MutableCombatant,
  CombatImpactLayer,
  CombatPoint,
  CombatBeamKind,
} from './strategic-combat-types';

export function runtimeCombatant(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide
): MutableCombatant {
  return side === 'attacker' ? runtime.attacker : runtime.defender;
}

export function runtimeEnemy(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide
): MutableCombatant {
  return side === 'attacker' ? runtime.defender : runtime.attacker;
}

export function noteRuntimeImpact(
  runtime: StrategicCombatRuntime,
  target: StrategicCombatSide,
  layer: CombatImpactLayer,
  damage: number,
  point: CombatPoint,
  weaponKind?: CombatBeamKind | 'plasma' | 'missile' | 'autocannon',
  weaponFamily?: ShipWeaponFamily
): void {
  runtime.impactSerial += 1;
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target,
    layer,
    damage,
    position: { ...point },
    ...(weaponKind ? { weaponKind } : {}),
    ...(weaponFamily ? { weaponFamily } : {}),
  };
}

export function addRuntimeBeam(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  kind: CombatBeamKind,
  family: ShipWeaponFamily,
  origin: CombatPoint,
  end: CombatPoint,
  weaponIndex: number
): void {
  runtime.beamSerial += 1;
  const maxTtlSeconds =
    family === 'front_repeater'
      ? VISION_REPEATER_SECONDS
      : family === 'railgun'
        ? RAIL_LANCE_SECONDS
      : family === 'ion_cannon'
        ? ION_CANNON_ARC_SECONDS
        : family === 'ion_laser'
          ? VISION_ION_LASER_SECONDS
          : family === 'pulse_laser'
            ? VISION_PULSE_SECONDS
            : kind === 'laser'
              ? 0.16
              : 0.09;
  runtime.beams.push({
    id: runtime.beamSerial,
    owner: side,
    kind,
    family,
    origin: { ...origin },
    end: { ...end },
    weaponIndex,
    ttlSeconds: maxTtlSeconds,
    maxTtlSeconds,
  });
}
