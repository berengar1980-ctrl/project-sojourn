import type { ShipWeaponFamily } from '../../core/ship-types';
import { WEAPON_VISUALS } from '../../core/weapon-visual-profiles';

import type {
  StrategicCombatRuntime,
  StrategicCombatSide,
  MutableCombatant,
  CombatImpactLayer,
  CombatPoint,
  CombatBeamKind,
  CombatImpactSnapshot,
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

/** Keep each physical hit in the shared combat event stream, including simultaneous mount hits. */
export function recordRuntimeImpact(
  runtime: StrategicCombatRuntime,
  impact: CombatImpactSnapshot
): void {
  runtime.lastImpact = impact;
  // Some focused physics tests use minimal mock runtimes without a visual history.
  if (!runtime.recentImpacts) return;
  runtime.recentImpacts.push(impact);
  if (runtime.recentImpacts.length > 64) {
    runtime.recentImpacts.splice(0, runtime.recentImpacts.length - 64);
  }
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
  recordRuntimeImpact(runtime, {
    serial: runtime.impactSerial,
    target,
    layer,
    damage,
    position: { ...point },
    ...(weaponKind ? { weaponKind } : {}),
    ...(weaponFamily ? { weaponFamily } : {}),
  });
}

export function addRuntimeBeam(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  kind: CombatBeamKind,
  family: ShipWeaponFamily,
  origin: CombatPoint,
  end: CombatPoint,
  weaponIndex: number,
  missed = false
): void {
  runtime.beamSerial += 1;
  const fallbackSeconds = kind === 'laser' ? 0.16 : 0.09;
  const maxTtlSeconds = WEAPON_VISUALS[family].beamSeconds ?? fallbackSeconds;
  runtime.beams.push({
    id: runtime.beamSerial,
    owner: side,
    kind,
    family,
    origin: { ...origin },
    end: { ...end },
    weaponIndex,
    missed,
    ttlSeconds: maxTtlSeconds,
    maxTtlSeconds,
  });
}
