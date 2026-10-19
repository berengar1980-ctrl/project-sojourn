import type { MutableCombatant } from './strategic-combat-types';

/** Finite, deterministic brownouts from an overcommitted *active* combat bus. */
export function advanceCombatPower(ship: MutableCombatant, dt: number): boolean {
  const power = ship.setup.power;
  if (!power || power.combat <= power.output) {
    delete ship.powerFault;
    ship.powerFaultRemaining = 0;
    ship.powerStress = 0;
    return false;
  }
  const remaining = Math.max(0, (ship.powerFaultRemaining ?? 0) - dt);
  ship.powerFaultRemaining = remaining;
  if (remaining > 0) return false;
  if (ship.powerFault) delete ship.powerFault;
  const excess = power.combat - power.output;
  const severity = excess / Math.max(1, power.output);
  ship.powerStress = (ship.powerStress ?? 0) + dt * severity;
  if (ship.powerStress < 1.1) return false;
  ship.powerStress = 0;
  ship.powerFault = severity >= 0.25 ? 'total' : 'weapons';
  ship.powerFaultRemaining = severity >= 0.25 ? 1.4 : 0.9;
  ship.boostActive = false;
  return true;
}

export function combatPowerDisabled(ship: MutableCombatant): boolean {
  return (ship.powerFaultRemaining ?? 0) > 0;
}
