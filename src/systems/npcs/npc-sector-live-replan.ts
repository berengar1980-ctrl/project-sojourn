import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import {
  planRouteFromPoint,
  repointRouteEndpoints,
  routeThreatExposure,
  type RouteThreatContact,
} from '../navigation/route-planner';
import { npcOrbitDestination } from './npc-orbit';
import { FUEL_DISTANCE_SCALE, routePoint } from './npc-sector-routing';

function pressureSignature(contacts: readonly RouteThreatContact[]): string {
  return contacts.map((contact) =>
    contact.kind + ':' +
    Math.round(contact.position.x / 160) + ':' +
    Math.round(contact.position.y / 160) + ':' +
    Math.round((contact.strength ?? 1) * 2)
  ).join('|');
}

function remainingRoute(
  waypoints: readonly WorldPoint[],
  distanceTravelled: number,
  current: WorldPoint
): WorldPoint[] {
  const result: WorldPoint[] = [current];
  let covered = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const first = waypoints[i - 1]!;
    const second = waypoints[i]!;
    covered += Math.hypot(second.x - first.x, second.y - first.y);
    if (covered > distanceTravelled + 0.001) result.push(second);
  }
  return result;
}

/**
 * Only moving pirate/patrol contacts may trigger re-routing. Fixed world hazard
 * ratings stay immutable, and an NPC cannot create fuel when changing course.
 */
export function replanNpcTravel(
  world: WorldMap,
  npc: SectorNpcState,
  liveContacts: readonly RouteThreatContact[],
  seconds: number
): boolean {
  const travel = npc.travel;
  if (!travel || travel.profile === 'fast') return false;
  travel.replanCooldown = Math.max(0, (travel.replanCooldown ?? 9) - seconds);
  if (travel.replanCooldown > 0) return false;
  travel.replanCooldown = 9;

  const signature = pressureSignature(liveContacts);
  if (travel.dangerSignature === signature) return false;
  travel.dangerSignature = signature;
  if (!liveContacts.some((contact) => contact.kind === 'pirate')) return false;

  const here = routePoint(travel.routePoints, travel.distanceTravelled);
  const oldRemaining = remainingRoute(travel.routePoints, travel.distanceTravelled, here);
  const previousExposure = routeThreatExposure(oldRemaining, liveContacts);
  if (previousExposure < 12) return false;

  const candidate = repointRouteEndpoints(
    planRouteFromPoint(world, here, travel.targetLocationId, travel.profile, liveContacts),
    here,
    npcOrbitDestination(world, npc, travel.targetLocationId)
  );
  const nextExposure = routeThreatExposure(candidate.points, liveContacts);
  const remainingDistance = Math.max(1, travel.routeDistance - travel.distanceTravelled);
  if (nextExposure > previousExposure * 0.72 || candidate.distance > remainingDistance * 1.65)
    return false;

  const fuelRequired = Math.max(0.1, candidate.distance * npc.fuelUse * FUEL_DISTANCE_SCALE);
  if (fuelRequired * 1.02 > npc.fuel) return false;
  npc.travel = {
    ...travel,
    routePoints: candidate.points,
    routeDistance: candidate.distance,
    distanceTravelled: 0,
    fuelRequired,
    dangerSignature: signature,
    replanCooldown: 9,
  };
  npc.activity = 'Kursänderung · Piratenaktivität';
  return true;
}
