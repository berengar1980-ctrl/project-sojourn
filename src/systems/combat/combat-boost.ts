import type { MutableCombatant } from './strategic-combat-types';

export const BOOST_DURATION_SECONDS = 3.5;
export const BOOST_COOLDOWN_SECONDS = 14;

export function activateCombatBoost(ship: MutableCombatant): boolean {
  if (ship.subsystems.engine <= 0 || (ship.boostSeconds ?? BOOST_DURATION_SECONDS) <= 0)
    return false;
  ship.boostActive = true;
  return true;
}

export function stopCombatBoost(ship: MutableCombatant): void {
  ship.boostActive = false;
}

export function updateCombatBoost(ship: MutableCombatant, dt: number): void {
  const charge = ship.boostSeconds ?? BOOST_DURATION_SECONDS;
  const active = ship.boostActive === true && ship.subsystems.engine > 0 && charge > 0;
  if (active) {
    ship.boostSeconds = Math.max(0, charge - dt);
    if (ship.boostSeconds === 0) ship.boostActive = false;
  } else {
    ship.boostActive = false;
    // A completely depleted tank takes 14 seconds to refill:
    // first third 6s, middle third 4.5s, final third 3.5s.
    const third = BOOST_DURATION_SECONDS / 3;
    let remaining = Math.max(0, dt);
    let energy = charge;
    while (remaining > 0 && energy < BOOST_DURATION_SECONDS) {
      const stage = energy < third ? 0 : energy < third * 2 ? 1 : 2;
      const boundary = stage === 0 ? third : stage === 1 ? third * 2 : BOOST_DURATION_SECONDS;
      const secondsPerThird = stage === 0 ? 6 : stage === 1 ? 4.5 : 3.5;
      const rate = third / secondsPerThird;
      const timeToBoundary = (boundary - energy) / rate;
      const elapsed = Math.min(remaining, timeToBoundary);
      energy = Math.min(boundary, energy + elapsed * rate);
      remaining -= elapsed;
    }
    ship.boostSeconds = energy;
  }
  const energy = ship.boostSeconds ?? BOOST_DURATION_SECONDS;
  const third = BOOST_DURATION_SECONDS / 3;
  ship.boostCooldownSeconds =
    (energy < third ? (third - energy) * (6 / third) + 8 : 0) +
    (energy >= third && energy < third * 2 ? (third * 2 - energy) * (4.5 / third) + 3.5 : 0) +
    (energy >= third * 2 ? (BOOST_DURATION_SECONDS - energy) * (3.5 / third) : 0);
}
