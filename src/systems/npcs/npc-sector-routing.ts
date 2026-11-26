import { fieldSecurityDroneCount, isSecurityDrone } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';
import type { RouteThreatContact } from '../navigation/route-planner';
import { pirateHuntAllowedAt, pirateThreatStrength } from './npc-pirate-classes';

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

/** NPC captains weigh nearby real piracy against patrol cover using their own risk preference. */
export function npcRouteThreats(
  self: SectorNpcState,
  npcs: readonly SectorNpcState[],
  livePosition: (npc: SectorNpcState) => WorldPoint
): RouteThreatContact[] {
  if (self.pirate || self.job === 'patrol') return [];
  return npcs
    .filter((npc) => npc.id !== self.id && activeContact(npc) && (npc.pirate || npc.job === 'patrol'))
    .map((npc) => ({
      position: livePosition(npc),
      kind: npc.pirate ? ('pirate' as const) : ('patrol' as const),
      strength: pirateThreatStrength(npc),
    }));
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

interface PirateHuntQuote {
  readonly fuelExpense: number;
}

function pirateHomeId(npc: SectorNpcState): string {
  return npc.factionId === 'pirates2' ? 'gallows-anchor' : 'blackjaw-outpost';
}

function activeContact(npc: SectorNpcState): boolean {
  return npc.hullHp > 0 && npc.retiredUntilDay === undefined && (npc.combatRecoverySeconds ?? 0) <= 0;
}

function pirateTrafficAt(
  location: WorldPoint,
  npcs: readonly SectorNpcState[],
  livePosition: (entry: SectorNpcState) => WorldPoint,
  pirateId: string
): { traffic: number; cargoUnits: number; rivals: number; patrols: number } {
  let traffic = 0;
  let cargoUnits = 0;
  let rivals = 0;
  let patrols = 0;
  for (const entry of npcs) {
    if (!activeContact(entry)) continue;
    const point = livePosition(entry);
    const distance = Math.hypot(point.x - location.x, point.y - location.y);
    const proximity = distance < 520 ? 1 : distance < 1000 ? 0.4 : 0;
    if (!proximity) continue;
    if (entry.pirate) {
      if (entry.id !== pirateId) rivals += proximity;
    } else if (entry.job === 'patrol') {
      patrols += proximity * pirateThreatStrength(entry);
    } else if (
      entry.hullHp > 0 &&
      !entry.combatMovement &&
      (entry.job === 'freighter' || entry.job === 'miner' || entry.job === 'salvager')
    ) {
      const carried = Object.values(entry.cargo).reduce(
        (sum, units) => sum + Math.max(0, Number(units) || 0),
        0
      );
      if (carried <= 0 || (!entry.travel && entry.autonomy?.phase !== 'working')) continue;
      traffic += proximity;
      cargoUnits += proximity * carried;
    }
  }
  return { traffic, cargoUnits, rivals, patrols };
}

/**
 * Pirate hunting is funded by anticipated traffic, not an unconditional patrol wage.
 * Cargo is a rough opportunity signal; no loot is minted when choosing a hunting ground.
 */
export function pirateHuntDestination(
  world: WorldMap,
  npc: SectorNpcState,
  npcs: readonly SectorNpcState[],
  livePosition: (entry: SectorNpcState) => WorldPoint,
  quoteTravel?: (destinationId: string) => PirateHuntQuote | null
): string | null {
  const homeId = pirateHomeId(npc);
  const home = world.locations.find((location) => location.id === homeId);
  const available = Math.max(0, npc.credits);
  const hullFraction = npc.hullMaxHp > 0 ? npc.hullHp / npc.hullMaxHp : 0;
  if (hullFraction < 0.4) return home && home.id !== npc.locationId ? home.id : null;

  const candidates = world.locations
    .filter(
      (location) =>
        (location.id !== npc.locationId ||
          (npc.pirateHuntZoneId === location.id && (npc.pirateHuntCycles ?? 0) > 0)) &&
        location.id !== homeId &&
        pirateHuntAllowedAt(npc, location) &&
        (location.activities.trade || location.activities.mine || location.activities.salvage)
    )
    .map((location) => {
      const quote = quoteTravel?.(location.id);
      if (quoteTravel && !quote) return null;
      const fuelExpense = quote?.fuelExpense ?? 0;
      const { traffic, cargoUnits, rivals, patrols } = pirateTrafficAt(
        location.position,
        npcs,
        livePosition,
        npc.id
      );
      const estimatedOpportunity = traffic * 1400 + Math.min(cargoUnits, 100) * 80;
      // Sector simulation may not instantiate local field drones until entry.
      // Use configured coverage only when no actual field drone contacts exist.
      const fieldDrones = npcs.filter((entry) => isSecurityDrone(entry.id) && entry.locationId === location.id);
      const configuredCoverage = location.activities.mine || location.activities.salvage
        ? fieldSecurityDroneCount(location.dangerLevel)
        : 0;
      const additionalCoverage = fieldDrones.length === 0 ? configuredCoverage : 0;
      const riskCost =
        (patrols + additionalCoverage) * (1800 - npc.aggression * 9) + rivals * 450 + (1 - hullFraction) * 1400;
      const homeDistance = home
        ? Math.hypot(home.position.x - location.position.x, home.position.y - location.position.y)
        : 2000;
      const returnFuelReserve = homeDistance * npc.fuelUse * FUEL_DISTANCE_SCALE * 10;
      const net = estimatedOpportunity - riskCost - fuelExpense - returnFuelReserve;
      const minimum = available < 1500 ? 350 : 0;
      if (net <= minimum) return null;
      const jitter = (hashId(npc.id + ':' + npc.successfulRuns + ':' + location.id) % 1000) / 1000;
      return {
        id: location.id,
        score: net + jitter * 125 + location.dangerLevel * 20,
      };
    })
    .filter((entry): entry is { id: string; score: number } => entry !== null)
    .sort((first, second) => second.score - first.score);

  const best = candidates[0];
  if (!best) return home && home.id !== npc.locationId ? home.id : null;

  // A remaining hunt cycle is not a reason to keep an unprofitable hunting ground.
  if (
    npc.pirateHuntZoneId === best.id &&
    (npc.pirateHuntCycles ?? 0) > 0 &&
    npc.locationId === best.id
  ) {
    npc.pirateHuntCycles = Math.max(0, (npc.pirateHuntCycles ?? 0) - 1);
    return null;
  }
  npc.pirateHuntZoneId = best.id;
  npc.pirateHuntCycles = 2 + (hashId(npc.id + ':' + best.id) % 5);
  return best.id;
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
