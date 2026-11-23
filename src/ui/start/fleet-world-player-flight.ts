import type { WorldPoint } from '../../core/world-types';
import { getShipDefinition, resolveShipLocalCruiseSpeed } from '../../systems/ships';
import {
  moveFieldShip,
  type FieldRouteObstacle,
  type FieldRouteShip,
} from '../../systems/navigation/field-ship-routing';
import { duelInstalledComponents, type DuelDraft } from './duel-combatant-setup';

interface PlayerPose {
  position: WorldPoint;
  headingRadians: number;
  velocity: WorldPoint;
}

/** Idle player routing uses exactly the existing campaign field ship navigator. */
export function createFleetWorldPlayerFlight(
  pose: PlayerPose,
  width: number,
  height: number,
  draft: DuelDraft,
  obstacles: () => readonly FieldRouteObstacle[]
) {
  const ship = getShipDefinition(draft.shipId);
  const speed = ship ? resolveShipLocalCruiseSpeed(ship, duelInstalledComponents(draft)) : 110;
  const route: FieldRouteShip = {
    position: pose.position,
    headingRadians: pose.headingRadians,
    speed: 0,
  };
  let destination: WorldPoint | null = null;
  return {
    invalidateRoute() {
      delete route.routeState;
    },
    navigate(point: WorldPoint) {
      destination = {
        x: Math.max(90, Math.min(width - 90, point.x)),
        y: Math.max(90, Math.min(height - 90, point.y)),
      };
      delete route.routeState;
    },
    tick(dt: number) {
      if (!destination) return;
      route.position = { ...pose.position };
      const reached = moveFieldShip(route, destination, speed, dt, obstacles(), 65);
      pose.position = { ...route.position };
      pose.headingRadians = route.headingRadians;
      pose.velocity = {
        x: Math.cos(route.headingRadians) * route.speed,
        y: Math.sin(route.headingRadians) * route.speed,
      };
      if (reached) destination = null;
    },
  };
}
