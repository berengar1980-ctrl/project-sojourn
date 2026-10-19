import type { MutableCombatant } from './strategic-combat-types';
import type { ShipWeaponProfile } from '../../core/ship-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import { nativeWeaponDamage } from './combat-native-damage';
import { effectiveTargetSubsystem } from './combat-subsystem-targeting';

/** Deliberate fire-control decisions; one decision can authorize a strong salvo. */
export const FIRE_CONTROL_CADENCE_SECONDS = 0.65;
export const FIRE_CONTROL_LOOKAHEAD_SECONDS = 0.24;

/** Account for the ship-wide launch cadence when evaluating one installed weapon. */
export function effectiveWeaponCycleSeconds(
  weapon: ShipWeaponProfile,
  crewMultiplier: number
): number {
  const cycle = weaponCycleSeconds(weapon, crewMultiplier);
  return Math.max(FIRE_CONTROL_CADENCE_SECONDS, cycle);
}

export function weaponCycleSeconds(weapon: ShipWeaponProfile, crewMultiplier: number): number {
  const adjustedCrew = Math.max(0.4, Math.min(2, crewMultiplier));
  return Math.max(0.05, weapon.cooldownSeconds * adjustedCrew);
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
  readonly forward: boolean;
}

/** Score actual combat damage, never nominal catalog numbers or weapon-family labels. */
function scoreShots(
  source: MutableCombatant,
  target: MutableCombatant,
  candidates: readonly FireControlCandidate[]
): { shots: ScoredShot[]; health: number } {
  const shielded = target.shieldHp > 0;
  const subsystem = effectiveTargetSubsystem(source, target);
  let health = shielded ? target.shieldHp : target.hullHp;
  if (!shielded && subsystem !== 'hull') health = target.subsystems[subsystem];

  const accuracy = source.setup.hitChance - target.setup.dodgeChance;
  const hitChance = Math.max(0.2, Math.min(0.98, accuracy));
  const multiplier = Math.max(0, source.setup.damageMultiplier);

  const shots = candidates.flatMap(({ index, component }) => {
    if (!component.weapon) return [];
    const damage = nativeWeaponDamage(component);
    const raw = shielded ? damage.shieldDamage : damage.hullDamage;
    if (raw <= 0 || health <= 0) return [];

    const expectedDamage = Math.min(health, raw * multiplier) * hitChance;
    const cycle = weaponCycleSeconds(component.weapon, source.setup.cycleTimeMultiplier);
    // Preserve the value of a loaded heavy weapon without always favoring raw alpha.
    const cycleFactor = Math.sqrt(Math.max(1, cycle / FIRE_CONTROL_CADENCE_SECONDS));
    const score = expectedDamage / cycleFactor;
    const readyIn = source.cooldowns[index] ?? 0;
    return [
      {
        index,
        expectedDamage,
        cycle,
        score,
        readyIn,
        forward: component.weapon.mount === 'forward',
      },
    ];
  });
  return { shots, health };
}

function compareShotValue(source: MutableCombatant, a: ScoredShot, b: ScoredShot): number {
  const difference = b.score - a.score;
  if (Math.abs(difference) > 0.000001) return difference;
  if (a.index === source.lastFiredWeaponIndex) return 1;
  if (b.index === source.lastFiredWeaponIndex) return -1;
  return a.index - b.index;
}

/**
 * A single authoritative scheduler chooses the useful ready gun or a strong
 * coordinated salvo. There are no railgun/repeater-specific firing exceptions.
 */
export function selectFireControlVolley(
  source: MutableCombatant,
  target: MutableCombatant,
  candidates: readonly FireControlCandidate[],
  now: number
): number[] {
  if (now + 0.000001 < (source.nextFireDecisionAt ?? 0)) return [];
  const { shots, health } = scoreShots(source, target, candidates);
  const ready = shots.filter((shot) => shot.readyIn <= 0.000001);
  ready.sort((a, b) => compareShotValue(source, a, b));
  const best = ready[0];
  if (!best) return [];

  // Only a short, bounded wait is justified when a much stronger gun is nearly ready.
  const betterSoon = shots.some(
    (shot) =>
      shot.readyIn > 0.000001 &&
      shot.readyIn <= FIRE_CONTROL_LOOKAHEAD_SECONDS &&
      shot.score > best.score * 1.75
  );
  if (betterSoon) return [];

  const volley = [best.index];
  let remaining = Math.max(0, health - best.expectedDamage);

  if (best.forward) {
    // All valid forward stations can share one aiming solution and launch together.
    // Very weak shield hits reserve loaded anti-hull weapons for the exposed hull.
    for (const shot of ready.slice(1)) {
      if (!shot.forward || remaining <= health * 0.05) continue;
      const veryWeak = shot.score < best.score * 0.2;
      const notFinishing = remaining > shot.expectedDamage * 1.5;
      if (veryWeak && notFinishing) continue;
      volley.push(shot.index);
      remaining = Math.max(0, remaining - shot.expectedDamage);
    }
    return volley;
  }

  // Non-forward stations retain the bounded coordinated heavy salvo.
  const overkill = remaining <= health * 0.05;
  const rapid = best.cycle < FIRE_CONTROL_CADENCE_SECONDS * 1.5;
  if (overkill || rapid) return volley;
  for (const second of ready.slice(1)) {
    if (second.cycle < FIRE_CONTROL_CADENCE_SECONDS * 1.5) continue;
    if (second.expectedDamage < best.expectedDamage * 0.6) continue;
    if (Math.min(remaining, second.expectedDamage) < health * 0.06) continue;
    volley.push(second.index);
    break;
  }
  return volley;
}

/** Only actual launches consume the shared fire-control cadence. */
export function commitFireControlVolley(
  source: MutableCombatant,
  now: number,
  firedIndices: readonly number[]
): void {
  source.nextFireDecisionAt = now + FIRE_CONTROL_CADENCE_SECONDS;
  const lastFired = firedIndices[firedIndices.length - 1];
  if (lastFired !== undefined) source.lastFiredWeaponIndex = lastFired;
}
