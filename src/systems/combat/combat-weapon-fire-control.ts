import type { CombatFireControl, MutableCombatant } from './strategic-combat-types';

const MIN_SHOT_INTERVAL = 0.45;

/** Ship-wide fire-control pulses recharge sequentially, not per weapon. */
export function fireControlRechargeSeconds(max: number): number {
  if (max <= 1) return 0.9;
  if (max === 2) return 0.8;
  if (max === 3) return 0.72;
  return 0.68;
}

export function rechargeFireControl(state: MutableCombatant, now: number): void {
  const control = state.fireControl;
  if (control.charges >= control.max) {
    control.nextRechargeAt = 0;
    return;
  }
  const recharge = fireControlRechargeSeconds(control.max);
  if (control.nextRechargeAt <= 0) control.nextRechargeAt = now + recharge;
  while (control.charges < control.max && now >= control.nextRechargeAt) {
    control.charges += 1;
    control.nextRechargeAt =
      control.charges < control.max ? control.nextRechargeAt + recharge : 0;
  }
}

export function fireControlReady(control: CombatFireControl, now: number): boolean {
  return control.charges > 0 && now - control.lastShotAt >= MIN_SHOT_INTERVAL - 0.000001;
}

export function consumeFireControl(state: MutableCombatant, now: number): boolean {
  rechargeFireControl(state, now);
  const control = state.fireControl;
  if (!fireControlReady(control, now)) return false;
  control.charges -= 1;
  control.lastShotAt = now;
  if (control.nextRechargeAt <= 0) {
    control.nextRechargeAt = now + fireControlRechargeSeconds(control.max);
  }
  return true;
}
