import type { WorldPoint } from '../../core/world-types';
import type { ShieldImpactEffect } from '../../core/shield-types';

export interface FleetWorldPose {
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly velocity: WorldPoint;
}

export interface FleetWorldContact extends FleetWorldPose {
  readonly id: string;
  readonly shipId: string;
  readonly name: string;
  readonly shieldImpacts?: readonly ShieldImpactEffect[];
  readonly miningBeamTarget?: WorldPoint;
}
