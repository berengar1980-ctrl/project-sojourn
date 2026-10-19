import type { ShipWeaponFamily } from './ship-types';
import {
  ION_CANNON_ARC_SECONDS,
  RAIL_LANCE_SECONDS,
  VISION_ION_LASER_SECONDS,
  VISION_PULSE_SECONDS,
  VISION_REPEATER_SECONDS,
} from './combat-visual-timings';

interface WeaponVisualProfile {
  readonly beamSeconds?: number;
  readonly impactDelaySeconds: number;
}

/** Presentation timings never change actual launch or damage events. */
export const WEAPON_VISUALS: Readonly<Record<ShipWeaponFamily, WeaponVisualProfile>> = {
  pulse_laser: { beamSeconds: VISION_PULSE_SECONDS, impactDelaySeconds: 0.42 },
  front_repeater: { beamSeconds: VISION_REPEATER_SECONDS, impactDelaySeconds: 0.045 },
  flux_projector: { beamSeconds: 0.45, impactDelaySeconds: 0.13 },
  plasma_battery: { impactDelaySeconds: 0 },
  guided_missile: { impactDelaySeconds: 0 },
  ion_laser: { beamSeconds: VISION_ION_LASER_SECONDS, impactDelaySeconds: 0.1 },
  ion_cannon: { beamSeconds: ION_CANNON_ARC_SECONDS, impactDelaySeconds: 0.075 },
  autocannon: { impactDelaySeconds: 0 },
  railgun: { beamSeconds: RAIL_LANCE_SECONDS, impactDelaySeconds: 0.045 },
  he_missile: { impactDelaySeconds: 0 },
};
