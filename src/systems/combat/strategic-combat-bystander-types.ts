import type { WorldPoint } from '../../core/world-types';

/** A live field pose remains owned by its field service. */
export interface FieldContactPose {
  position: WorldPoint;
  headingRadians: number;
  speed?: number;
}

export interface FieldBystanderContact {
  readonly pose: Readonly<FieldContactPose>;
  readonly pushWeight: number;
  /** Apply one correction to the original field pose; null means ownership changed. */
  apply(normal: WorldPoint, distance: number, velocityDelta: number): number | null;
}

/** Local civilian collider seen by native PvP, never an extra combat target. */
export interface StrategicCombatBystander {
  readonly id: string;
  readonly shipId: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly fieldContact?: FieldBystanderContact;
}
