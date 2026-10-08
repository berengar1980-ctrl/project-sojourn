import type { ShipWeaponFamily } from '../../core/ship-types';

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
  point: CombatPoint
): void {
  runtime.impactSerial += 1;
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target,
    layer,
    damage,
    position: { ...point },
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
  const maxTtlSeconds = kind === 'laser' ? 0.16 : 0.09;
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
