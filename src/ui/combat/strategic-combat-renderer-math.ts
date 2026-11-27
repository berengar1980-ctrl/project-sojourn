import { clamp } from '../../core/numeric-geometry';
export { stableHash as hash } from '../../core/stable-hash';

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

import type { ShipWeaponFamily } from '../../core/ship-types';

/** Fit weapon contact flashes to the projected target, not fixed screen pixels. */
export function weaponImpactView(
  shipHeightPx: number,
  family: ShipWeaponFamily,
  shielded: boolean
): { readonly radius: number; readonly scale: number } {
  const extent: Record<ShipWeaponFamily, number> = {
    pulse_laser: 22,
    front_repeater: 25,
    flux_projector: 52,
    plasma_battery: 55,
    guided_missile: 45,
    ion_laser: 80,
    ion_cannon: 80,
    autocannon: 30,
    railgun: 65,
    he_missile: 100,
  };
  // A shield flare must never obscure the larger, canonical shield reaction.
  const radius = Math.max(2.5, Math.max(8, shipHeightPx) * (shielded ? 0.24 : 0.38));
  return { radius, scale: Math.min(1, radius / extent[family]) };
}
