import type { SectorNpcState } from '../../core/npc-types';

import type { WorldMap, WorldPoint } from '../../core/world-types';

import { type RoutePlan, type RouteProfile } from '../navigation/route-planner';

export const FUEL_DISTANCE_SCALE = 0.025;

export function hashId(id: string): number {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function routeProfile(npc: SectorNpcState): RouteProfile {
  if (npc.pirate) return 'fast';
  if (npc.job === 'patrol') return npc.aggression >= 35 ? 'fast' : 'balanced';
  if (npc.aggression <= 28) return 'safe';
  if (npc.aggression >= 68) return 'fast';
  return npc.job === 'miner' || npc.job === 'salvager' ? 'safe' : 'balanced';
}

export function routeFuel(npc: SectorNpcState, route: RoutePlan): number {
  return Math.max(0.1, route.distance * npc.fuelUse * FUEL_DISTANCE_SCALE);
}

export function routePoint(route: readonly WorldPoint[], distance: number): WorldPoint {
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

export function routeHeading(route: readonly WorldPoint[], distance: number): number {
  const here = routePoint(route, distance);
  const ahead = routePoint(route, distance + 20);
  const dx = ahead.x - here.x;
  const dy = ahead.y - here.y;
  return Math.hypot(dx, dy) > 0.001 ? Math.atan2(dy, dx) : 0;
}

export function locationPoint(world: WorldMap, id: string): WorldPoint {
  return world.locations.find((location) => location.id === id)?.position ?? { x: 0, y: 0 };
}

export function patrolDestination(world: WorldMap, npc: SectorNpcState): string | null {
  const origin = locationPoint(world, npc.locationId);
  const candidates = world.locations
    .filter(
      (location) =>
        location.id !== npc.locationId &&
        (location.activities.trade || location.activities.dock || location.activities.mine)
    )
    .map((location) => {
      const distance = Math.hypot(location.position.x - origin.x, location.position.y - origin.y);
      const dangerBias = location.dangerLevel * (1.2 + npc.aggression / 100);
      const random = (hashId(npc.id + ':' + npc.successfulRuns + ':' + location.id) % 1000) / 1000;
      return { id: location.id, score: dangerBias + random * 1.4 - distance / 4200 };
    })
    .sort((first, second) => second.score - first.score);
  return candidates[0]?.id ?? null;
}

export function pirateHuntDestination(
  world: WorldMap,
  npc: SectorNpcState,
  npcs: readonly SectorNpcState[],
  livePosition: (entry: SectorNpcState) => WorldPoint
): string | null {
  const currentZone = npc.pirateHuntZoneId
    ? world.locations.find((location) => location.id === npc.pirateHuntZoneId)
    : null;
  const currentDensity = currentZone
    ? npcs.filter(
        (entry) =>
          entry.pirate &&
          entry.id !== npc.id &&
          Math.hypot(
            livePosition(entry).x - currentZone.position.x,
            livePosition(entry).y - currentZone.position.y
          ) < 850
      ).length
    : 0;

  if (currentZone && (npc.pirateHuntCycles ?? 0) > 0 && currentDensity < 3) {
    npc.pirateHuntCycles = Math.max(0, (npc.pirateHuntCycles ?? 0) - 1);
    if (currentZone.id !== npc.locationId) return currentZone.id;
  }

  const homeId = npc.factionId === 'pirates2' ? 'gallows-anchor' : 'blackjaw-outpost';
  const home = world.locations.find((location) => location.id === homeId)?.position;
  const candidates = world.locations
    .filter(
      (location) =>
        location.id !== npc.locationId &&
        location.id !== homeId &&
        (location.activities.trade || location.activities.mine || location.activities.salvage)
    )
    .map((location) => {
      const traffic = npcs.reduce((sum, entry) => {
        if (
          entry.pirate ||
          (entry.job !== 'freighter' && entry.job !== 'miner' && entry.job !== 'salvager')
        ) {
          return sum;
        }
        const point = livePosition(entry);
        const range = Math.hypot(point.x - location.position.x, point.y - location.position.y);
        return sum + (range < 520 ? 1 : range < 1000 ? 0.4 : 0);
      }, 0);
      const density = npcs.reduce((sum, entry) => {
        if (!entry.pirate || entry.id === npc.id) return sum;
        const point = livePosition(entry);
        const range = Math.hypot(point.x - location.position.x, point.y - location.position.y);
        return sum + (range < 520 ? 1.5 : range < 1000 ? 0.6 : 0);
      }, 0);
      const patrolPressure = npcs.reduce((sum, entry) => {
        if (entry.pirate || entry.job !== 'patrol') return sum;
        const point = livePosition(entry);
        const range = Math.hypot(point.x - location.position.x, point.y - location.position.y);
        return sum + (range < 520 ? 1 : range < 1000 ? 0.35 : 0);
      }, 0);
      const homeRange = home
        ? Math.hypot(home.x - location.position.x, home.y - location.position.y)
        : 2000;
      const homeBonus = Math.max(0, 1.4 - homeRange / 4200);
      const jitter = (hashId(npc.id + ':' + npc.successfulRuns + ':' + location.id) % 1000) / 1000;
      return {
        id: location.id,
        score:
          2.2 +
          traffic * 2.4 +
          homeBonus +
          location.dangerLevel * 0.55 +
          jitter * 2.2 -
          density * 3.4 -
          patrolPressure * 0.85,
      };
    })
    .sort((first, second) => second.score - first.score);

  const pool = candidates.slice(0, Math.min(3, candidates.length));
  const pick = pool[hashId(npc.id + ':' + npc.successfulRuns) % Math.max(1, pool.length)];
  if (!pick) return homeId;
  npc.pirateHuntZoneId = pick.id;
  npc.pirateHuntCycles = 2 + (hashId(npc.id + ':' + pick.id) % 5);
  return pick.id;
}

function angleDelta(current: number, target: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function turnToward(current: number, target: number, maximumDelta: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

export function nearestLocation(world: WorldMap, position: WorldPoint): string | null {
  return (
    world.locations
      .map((location) => ({
        id: location.id,
        distance: Math.hypot(location.position.x - position.x, location.position.y - position.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.id ?? null
  );
}
