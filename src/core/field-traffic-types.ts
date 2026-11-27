import type { WorldPoint } from './world-types';

export interface FieldTrafficIntent {
  readonly priority: number;
  readonly movable: boolean;
  readonly waitingSeconds: number;
  readonly direction?: WorldPoint;
}

export interface FieldRouteObstacle {
  readonly id: string;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly velocity?: WorldPoint;
  readonly intent?: FieldTrafficIntent;
}
