import type { MutableCombatant } from './strategic-combat-types';
import type { ShipWeaponProfile } from '../../core/ship-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import { nativeWeaponDamage } from './combat-native-damage';
import { effectiveTargetSubsystem } from './combat-subsystem-targeting';

/** One deliberate fire-control decision at a time; a decision may release a real salvo. */
export const FIRE_CONTROL_CADENCE_SECONDS = 0.8;
export const FIRE_CONTROL_LOOKAHEAD_SECONDS = 0.24;

export function weaponCycleSeconds(weapon: ShipWeaponProfile, crewMultiplier: number): number {
  return Math.max(0.05, weapon.cooldownSeconds * Math.max(0.4, Math.min(2, crewMultiplier)));
}

export function advanceWeaponCooldowns(ship: MutableCombatant, dt: number): void {
  for (let index = 0; index < ship.setup.weapons.length; index += 1) {
    const remaining = (ship.cooldowns[index] ?? 0) - dt;
    ship.cooldowns[index] = remaining <= 0.000001 ? 0 : remaining;
  }
}

export interface FireControlCandidate {
  readonly index: number;
  readonly component: ShipComponentDefinition;
}

interface ScoredShot {
  readonly index: number;
  readonly expectedDamage: number;
  readonly cycle: number;
  readonly score: number;
  readonly readyIn: number;
}

/** Use actual combat damage and target-layer health, never the economy/catalog UI values. */
function scoreShots(
  source: MutableCombatant,
  target: MutableCombatant,
  candidates: readonly FireControlCandidate[]
): { shots: ScoredShot[]; health: number } {
  const shielded = target.shieldHp > 0;
  const subsystem = effectiveTargetSubsystem(source, target);
  const health = shielded
    ? target.shieldHp
    : subsystem === 'hull'
      ? target.hullHp
      : target.subsystems[subsystem];
  const hitChance = Math.max(0.2, Math.min(0.98, source.setup.hitChance - target.setup.dodgeChance));
  const multiplier = Math.max(0, source.setup.damageMultiplier);
  const shots = candidates.flatMap(({ index, component }) => {
    if (!component.weapon) return [];
    const damage = nativeWeaponDamage(component);
    const raw = shielded ? damage.shieldDamage : damage.hullDamage;
    if (raw <= 0 || health <= 0) return [];
    const expectedDamage = Math.min(health, raw * multiplier) * hitChance;
    const cycle = weaponCycleSeconds(component.weapon, source.setup.cycleTimeMultiplier);
    // Sustained output matters, but a loaded heavy gun must retain its alpha-strike value.
    // Square-root weighting avoids both 'fastest always wins' and 'biggest always wins'.
    const score = expectedDamage / Math.sqrt(Math.max(1, cycle / FIRE_CONTROL_CADENCE_SECONDS));
    return [{ index, expectedDamage, cycle, score, readyIn: source.cooldowns[index] ?? 0 }];
  });
  return { shots, health };
}

/**
 * Select only the most valuable legal fire opportunity. A strong second shot can
 * join the same salvo, while low-impact rapid guns fire as successive decisions.
 * The planner is generic: no weapon family has a special priority or reservation.
 */
export function selectFireControlVolley(
  source: MutableCombatant,
  target: MutableCombatant,
  candidates: readonly FireControlCandidate[],
  now: number
): number[] {
  if (now + 0.000001 < (source.nextFireDecisionAt ?? 0)) return [];
  const { shots, health } = scoreShots(source, target, candidates);
  const ready = shots.filter((shot) => shot.readyIn <= 0.000001).sort((a, b) => b.score - a.score);
  const best = ready[0];
  if (!best) return [];

  // A superior weapon that will finish reloading almost immediately may
  // justify a short wait, but never reserve a gun for an indefinite future event.
  if (
    shots.some(
      (shot) =>
        shot.readyIn > 0.000001 &&
        shot.readyIn <= FIRE_CONTROL_LOOKAHEAD_SECONDS &&
        shot.score > best.score * 1.75
    )
  ) {
    return [];
  }

  const volley = [best.index];
  const remaining = Math.max(0, health - best.expectedDamage);
  if (remaining <= 0 || best.cycle < FIRE_CONTROL_CADENCE_SECONDS * 1.5) return volley;
  const second = ready.slice(1).find(
    (shot) =>
      shot.cycle >= FIRE_CONTROL_CADENCE_SECONDS * 1.5 &&
      shot.expectedDamage >= best.expectedDamage * 0.6 &&
      Math.min(remaining, shot.expectedDamage) >= health * 0.06
  );
  if (second) volley.push(second.index);
  return volley;
}

/** Commit cadence only after real weapon launches; blocked shots never spend a decision. */
export function commitFireControlVolley(source: MutableCombatant, now: number): void {
  source.nextFireDecisionAt = now + FIRE_CONTROL_CADENCE_SECONDS;
}
