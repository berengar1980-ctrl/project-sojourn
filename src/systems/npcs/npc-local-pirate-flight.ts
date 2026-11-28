import { DRONE_PATROL_SPEED } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';
import { localNpcFlightPerformance } from './npc-local-physical-pose';

export function patrolFlightPerformance(npc: SectorNpcState | undefined, drone: boolean) {
  if (drone) {
    return {
      combatSpeed: DRONE_PATROL_SPEED,
      turnRateRadiansPerSecond: 0.72,
      accelerationMetersPerSecond2: 28,
    };
  }
  return npc ? localNpcFlightPerformance(npc, 118) : undefined;
}
