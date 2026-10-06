import type { SectorNpcState } from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { getShipDefinition } from '../ships';
import { npcOperationalSpeed, tryNpcComponentUpgrade } from './npc-upgrade-service';
import {
  planRouteWithProfile,
  type RoutePlan,
  type RouteProfile,
} from '../navigation/route-planner';

const FUEL_DISTANCE_SCALE = 0.025;

export interface NpcSectorService {
  readonly npcs: readonly SectorNpcState[];
  requestTravel(npc: SectorNpcState, destinationId: string, reason?: string): boolean;
  isTravelling(npc: SectorNpcState): boolean;
  livePosition(npc: SectorNpcState): WorldPoint;
  tick(deltaSeconds: number): void;
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function routeProfile(npc: SectorNpcState): RouteProfile {
  if (npc.job === 'patrol') return npc.aggression >= 35 ? 'fast' : 'balanced';
  if (npc.aggression <= 28) return 'safe';
  if (npc.aggression >= 68) return 'fast';
  return npc.job === 'miner' || npc.job === 'salvager' ? 'safe' : 'balanced';
}

function routeFuel(npc: SectorNpcState, route: RoutePlan): number {
  return Math.max(0.1, route.distance * npc.fuelUse * FUEL_DISTANCE_SCALE);
}

function routePoint(route: readonly WorldPoint[], distance: number): WorldPoint {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1]!;
    const to = route[index]!;
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= segment || index === route.length - 1) {
      const t = segment <= 0 ? 1 : Math.min(1, remaining / segment);
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    remaining -= segment;
  }
  return route[route.length - 1] ?? { x: 0, y: 0 };
}

function locationPoint(world: WorldMap, id: string): WorldPoint {
  return world.locations.find((location) => location.id === id)?.position ?? { x: 0, y: 0 };
}

function patrolDestination(world: WorldMap, npc: SectorNpcState): string | null {
  const candidates = world.locations
    .filter(
      (location) =>
        location.id !== npc.locationId &&
        (location.activities.trade || location.activities.dock || location.activities.mine)
    )
    .map((location) => {
      const distance = Math.hypot(
        location.position.x - locationPoint(world, npc.locationId).x,
        location.position.y - locationPoint(world, npc.locationId).y
      );
      const dangerBias = location.dangerLevel * (1.2 + npc.aggression / 100);
      const jitter = ((hashId(npc.id + ':' + npc.successfulRuns + ':' + location.id) % 1000) / 1000) * 1.4;
      return { id: location.id, score: dangerBias + jitter - distance / 4200 };
    })
    .sort((first, second) => second.score - first.score);
  return candidates[0]?.id ?? null;
}

export function createNpcSectorService(
  world: WorldMap,
  npcs: readonly SectorNpcState[]
): NpcSectorService {
  function buildRoute(npc: SectorNpcState, fromId: string, toId: string): RoutePlan {
    return planRouteWithProfile(world, fromId, toId, routeProfile(npc));
  }

  function startLeg(
    npc: SectorNpcState,
    targetLocationId: string,
    finalTargetId: string,
    refuelStops: readonly string[],
    reason: string
  ): boolean {
    const route = buildRoute(npc, npc.locationId, targetLocationId);
    const fuelRequired = routeFuel(npc, route);
    if (fuelRequired > npc.fuel + 0.001) return false;
    npc.travel = {
      finalTargetId,
      targetLocationId,
      routePoints: route.points,
      routeDistance: route.distance,
      distanceTravelled: 0,
      fuelRequired,
      profile: route.profile,
      refuelStops,
    };
    npc.activityId = 'travel';
    npc.activity = reason;
    return true;
  }

  function refuelItinerary(npc: SectorNpcState, destinationId: string): readonly string[] | null {
    const profile = routeProfile(npc);
    const refuelIds = world.locations
      .filter(
        (location) =>
          location.id !== npc.locationId &&
          location.id !== destinationId &&
          location.activities.refuel
      )
      .map((location) => location.id);
    const nodeIds = [npc.locationId, ...refuelIds, destinationId];
    const distances = nodeIds.map(() => Number.POSITIVE_INFINITY);
    const previous = nodeIds.map(() => -1);
    const visited = new Set<number>();
    distances[0] = 0;

    while (visited.size < nodeIds.length) {
      let current = -1;
      let best = Number.POSITIVE_INFINITY;
      for (let index = 0; index < nodeIds.length; index += 1) {
        if (!visited.has(index) && distances[index]! < best) {
          current = index;
          best = distances[index]!;
        }
      }
      if (current < 0 || current === nodeIds.length - 1) break;
      visited.add(current);

      const availableFuel = current === 0 ? npc.fuel * 0.96 : npc.fuelCapacity * 0.94;
      for (let next = 1; next < nodeIds.length; next += 1) {
        if (next === current || visited.has(next)) continue;
        const route = planRouteWithProfile(world, nodeIds[current]!, nodeIds[next]!, profile);
        if (routeFuel(npc, route) > availableFuel) continue;
        const score = distances[current]! + route.distance;
        if (score < distances[next]!) {
          distances[next] = score;
          previous[next] = current;
        }
      }
    }

    const targetIndex = nodeIds.length - 1;
    if (!Number.isFinite(distances[targetIndex]!)) return null;
    const path: string[] = [];
    let cursor = targetIndex;
    while (cursor > 0) {
      path.push(nodeIds[cursor]!);
      cursor = previous[cursor]!;
      if (cursor < 0) return null;
    }
    path.reverse();
    return path.slice(0, -1);
  }

  const service: NpcSectorService = {
    npcs,

    requestTravel(npc, destinationId, reason = 'Flug') {
      if (npc.travel || destinationId === npc.locationId) return false;
      if (!world.locations.some((location) => location.id === destinationId)) return false;
      const direct = buildRoute(npc, npc.locationId, destinationId);
      const directFuel = routeFuel(npc, direct);
      if (directFuel <= npc.fuel * 0.96) {
        return startLeg(npc, destinationId, destinationId, [], reason);
      }

      const stops = refuelItinerary(npc, destinationId);
      if (!stops || stops.length === 0) return false;
      return startLeg(npc, stops[0]!, destinationId, stops, reason + ' · Tankstopp');
    },

    isTravelling(npc) {
      return Boolean(npc.travel);
    },

    livePosition(npc) {
      return npc.travel
        ? routePoint(npc.travel.routePoints, npc.travel.distanceTravelled)
        : locationPoint(world, npc.locationId);
    },

    tick(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, 0.25);

      for (const npc of npcs) {
        const travel = npc.travel;
        if (!travel) {
          const current = world.locations.find((location) => location.id === npc.locationId);
          if (current?.activities.refuel && npc.fuel < npc.fuelCapacity * 0.92) {
            npc.fuel = npc.fuelCapacity;
          }
          if (current?.activities.shipyard) tryNpcComponentUpgrade(npc);
          if (npc.job === 'patrol') {
            const target = patrolDestination(world, npc);
            if (target) service.requestTravel(npc, target, 'Sicherheitspatrouille');
          }
          continue;
        }

        const ship = getShipDefinition(npc.shipId);
        const speed = ship ? npcOperationalSpeed(npc) : 180;
        const remaining = Math.max(0, travel.routeDistance - travel.distanceTravelled);
        const moved = Math.min(remaining, speed * dt);
        travel.distanceTravelled += moved;
        npc.fuel = Math.max(
          0,
          npc.fuel - travel.fuelRequired * (moved / Math.max(1, travel.routeDistance))
        );

        if (travel.distanceTravelled + 0.001 < travel.routeDistance) continue;

        npc.locationId = travel.targetLocationId;
        const finalTargetId = travel.finalTargetId;
        const reachedFinal = npc.locationId === finalTargetId;
        const remainingStops =
          travel.refuelStops[0] === npc.locationId
            ? travel.refuelStops.slice(1)
            : travel.refuelStops;
        delete npc.travel;
        npc.successfulRuns += 1;

        const arrival = world.locations.find((location) => location.id === npc.locationId);
        if (arrival?.activities.refuel) npc.fuel = npc.fuelCapacity;

        if (!reachedFinal) {
          const nextTarget = remainingStops[0] ?? finalTargetId;
          startLeg(
            npc,
            nextTarget,
            finalTargetId,
            remainingStops,
            'Weiterflug nach Tankstopp'
          );
        } else {
          npc.activityId = npc.job === 'patrol' ? 'patrol' : 'dock';
          npc.activity = npc.job === 'patrol' ? 'Sicherheitspatrouille' : 'Liegezeit';
        }
      }
    },
  };

  return service;
}
