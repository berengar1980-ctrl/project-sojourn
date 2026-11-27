import { absorbDamage } from '../../core/layered-damage';
import { clamp } from '../../core/numeric-geometry';
import type {
  ShieldDamageResult,
  ShieldHit,
  ShieldImpactEffect,
  ShieldState,
} from '../../core/shield-types';

const REFERENCE_IMPACT_ENERGY = 250_000;

export function createShieldState(maxHp: number, modifier: number): ShieldState {
  if (maxHp <= 0) throw new Error('Shield maxHp must be positive.');
  if (modifier <= 0) throw new Error('Shield modifier must be positive.');
  return { maxHp, modifier, currentHp: maxHp };
}

export function damageFromImpactEnergy(impactEnergy: number, modifier: number): number {
  if (impactEnergy <= 0) return 0;
  const normalized = impactEnergy / REFERENCE_IMPACT_ENERGY;
  return clamp((100 * Math.pow(normalized, 0.55)) / modifier, 1, 100);
}

function rawDamage(hit: ShieldHit, state: ShieldState): number {
  if (hit.directDamage != null) return Math.max(0, hit.directDamage / state.modifier);
  return damageFromImpactEnergy(hit.impactEnergy ?? 0, state.modifier);
}

export function applyShieldHit(
  state: ShieldState,
  hit: ShieldHit,
  impactId: number
): ShieldDamageResult {
  const damage = rawDamage(hit, state);
  const absorption = absorbDamage(state.currentHp, damage);
  const absorbedDamage = absorption.absorbed;
  const overflowDamage = absorption.overflow;
  state.currentHp = absorption.remaining;

  const visualStrength = Math.sqrt(clamp(damage / state.maxHp, 0, 1));
  const impact: ShieldImpactEffect = {
    id: impactId,
    source: hit.source,
    point: hit.point,
    normal: hit.normal,
    surfaceAnchor: hit.surfaceAnchor,
    damage,
    strength: visualStrength,
    lifetimeSeconds: 0.4 + visualStrength * 0.45,
    ageSeconds: 0,
  };

  return { damage, absorbedDamage, overflowDamage, impact };
}

export function advanceShieldImpacts(
  impacts: readonly ShieldImpactEffect[],
  deltaSeconds: number
): ShieldImpactEffect[] {
  return impacts
    .map((impact) => ({ ...impact, ageSeconds: impact.ageSeconds + deltaSeconds }))
    .filter((impact) => impact.ageSeconds < impact.lifetimeSeconds);
}
