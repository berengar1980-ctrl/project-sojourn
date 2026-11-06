import type {
  NpcCombatMovementMode,
  NpcCombatTargetKind,
  SectorNpcState,
} from '../../core/npc-types';

import type { WorldMap, WorldPoint } from '../../core/world-types';

import { getShipDefinition } from '../ships';

import { npcOperationalSpeed } from './npc-upgrade-service';
import { advanceNpcCombatMovement } from './npc-sector-combat-movement';

import {
  planRouteFromPoint,
  planRouteWithProfile,
  repointRouteEndpoints,
  type RoutePlan,
} from '../navigation/route-planner';

import {
  hashId,
  nearestLocation,
  patrolDestination,
  pirateHuntDestination,
  routeFuel,
  routeHeading,
  routePoint,
  routeProfile,
} from './npc-sector-routing';

import { FUEL_DISTANCE_SCALE } from './npc-sector-routing';
import {
  advanceNpcOrbit,
  npcOrbitDestination,
  npcOrbitHeading,
  npcOrbitPosition,
  npcOrbitStateFor,
} from './npc-orbit';
import { isServicedPort, payNpcPatrolContract } from './npc-port-servicing';
import { serviceNpcAtLocation, serviceIdleNpc } from './npc-port-economy';
import { npcNeedsSafeReturn } from './npc-operating-policy';
import { planFuelRoute } from '../navigation/fuel-route-planner';
import { FUEL_PRICE_PER_UNIT } from '../ships/ship-operating-costs';

import type { NpcSectorService, NpcSectorServiceOptions } from './npc-sector-types';

export type { NpcSectorServiceOptions } from './npc-sector-types';

export type { NpcSectorService } from './npc-sector-types';

const COMBAT_RECOVERY_MIN_SECONDS = 45;

const COMBAT_RECOVERY_SPAN_SECONDS = 76;

class SectorService implements NpcSectorService {
  constructor(
    private readonly world: WorldMap,
    readonly npcs: readonly SectorNpcState[],
    private readonly options: NpcSectorServiceOptions = {}
  ) {}
  private recoveryLocation = (npc: SectorNpcState, position: WorldPoint): string | null => {
    if (npc.pirate) {
      const homeId = npc.factionId === 'pirates2' ? 'gallows-anchor' : 'blackjaw-outpost';
      if (this.world.locations.some((location) => location.id === homeId)) return homeId;
    }

    const candidates = this.world.locations
      .filter(
        (location) =>
          location.activities.shipyard || location.activities.dock || location.activities.refuel
      )
      .map((location) => ({
        id: location.id,
        priority: location.activities.shipyard ? 0 : location.activities.dock ? 1 : 2,
        distance: Math.hypot(location.position.x - position.x, location.position.y - position.y),
      }))
      .sort(
        (first, second) => first.priority - second.priority || first.distance - second.distance
      );
    return candidates[0]?.id ?? nearestLocation(this.world, position);
  };
  private beginCombatRecovery = (
    npc: SectorNpcState,
    position: WorldPoint,
    reason: string = 'Kampfunfähig'
  ): boolean => {
    const destinationId = this.recoveryLocation(npc, position);
    if (!destinationId) return false;

    delete npc.travel;
    delete npc.combatMovement;
    npc.locationId = destinationId;
    npc.orbit = npcOrbitStateFor(this.world, npc, destinationId);
    // Emergency recovery returns a disabled ship to port, not a free full repair.
    npc.hullHp = 1;
    npc.combatDefeats = (npc.combatDefeats ?? 0) + 1;
    npc.combatRecoveryLocationId = destinationId;
    npc.combatRecoverySeconds =
      COMBAT_RECOVERY_MIN_SECONDS +
      (hashId(npc.id + ':' + npc.combatDefeats) % COMBAT_RECOVERY_SPAN_SECONDS);
    npc.activityId = 'repair';
    npc.activity = reason + ' · geborgen · Reparatur';
    return true;
  };
  private advanceCombatRecovery = (npc: SectorNpcState, deltaSeconds: number): boolean => {
    const remaining = npc.combatRecoverySeconds ?? 0;
    if (remaining <= 0) return false;
    npc.combatRecoverySeconds = Math.max(0, remaining - deltaSeconds);
    if (npc.combatRecoverySeconds > 0) return true;

    serviceNpcAtLocation(this.world, npc);
    delete npc.combatRecoverySeconds;
    delete npc.combatRecoveryLocationId;
    const intact = npc.hullHp >= npc.hullMaxHp;
    npc.activityId = intact
      ? npc.pirate
        ? 'raiding'
        : npc.job === 'patrol'
          ? 'patrol'
          : 'dock'
      : 'maintenance';
    npc.activity = intact
      ? 'Reparatur abgeschlossen · bereit'
      : 'Teilreparatur · weitere Wartung nur gegen Credits';
    return true;
  };
  private buildRoute = (npc: SectorNpcState, fromId: string, toId: string): RoutePlan => {
    const base = planRouteWithProfile(this.world, fromId, toId, routeProfile(npc));
    return repointRouteEndpoints(
      base,
      this.livePosition(npc),
      npcOrbitDestination(this.world, npc, toId)
    );
  };
  private startLeg = (
    npc: SectorNpcState,
    targetLocationId: string,
    finalTargetId: string,
    refuelStops: readonly string[],
    reason: string
  ): boolean => {
    const route = this.buildRoute(npc, npc.locationId, targetLocationId);
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
  };
  private startDeepSpaceLeg = (
    npc: SectorNpcState,
    from: WorldPoint,
    destinationId: string,
    reason: string
  ): boolean => {
    const route = repointRouteEndpoints(
      planRouteFromPoint(this.world, from, destinationId, routeProfile(npc)),
      from,
      npcOrbitDestination(this.world, npc, destinationId)
    );
    const fuelRequired = routeFuel(npc, route);
    if (fuelRequired > npc.fuel + 0.001) return false;
    npc.travel = {
      finalTargetId: destinationId,
      targetLocationId: destinationId,
      routePoints: route.points,
      routeDistance: route.distance,
      distanceTravelled: 0,
      fuelRequired,
      profile: route.profile,
      refuelStops: [],
    };
    npc.activityId = 'travel';
    npc.activity = reason;
    return true;
  };
  private beginCombatMovement = (
    npc: SectorNpcState,
    mode: 'pursue' | 'flee',
    targetKind: NpcCombatTargetKind,
    targetId: string,
    targetPosition: WorldPoint,
    reason: string
  ): boolean => {
    if (npc.hullHp <= 0 || (npc.combatRecoverySeconds ?? 0) > 0) return false;
    const position = this.livePosition(npc);
    const headingRadians = this.liveHeading(npc);
    const speed = npc.combatMovement?.speed ?? 0;
    delete npc.travel;
    npc.combatMovement = {
      mode,
      targetKind,
      targetId,
      position: { ...position },
      headingRadians,
      speed,
    };
    npc.activityId = mode;
    npc.activity = reason;
    const dx = targetPosition.x - position.x;
    const dy = targetPosition.y - position.y;
    if (Math.hypot(dx, dy) > 0.001) {
      npc.combatMovement.headingRadians =
        mode === 'pursue' ? Math.atan2(dy, dx) : Math.atan2(-dy, -dx);
    }
    return true;
  };
  private targetPosition = (
    movement: NonNullable<SectorNpcState['combatMovement']>,
    npcPositions: ReadonlyMap<string, WorldPoint>,
    playerPosition: WorldPoint | null
  ): WorldPoint | null => {
    if (movement.targetKind === 'player') return playerPosition;
    return npcPositions.get(movement.targetId) ?? null;
  };
  quoteTravel = (npc: SectorNpcState, destinationId: string, availableCredits = npc.credits) => {
    if (npc.locationId === destinationId) {
      return { distance: 0, refuelCost: 0, fuelExpense: 0 };
    }
    const planned = planFuelRoute({
      world: this.world,
      fromId: npc.locationId,
      fromPosition: this.livePosition(npc),
      destinationId,
      profile: routeProfile(npc),
      fuel: npc.fuel,
      capacity: npc.fuelCapacity,
      credits: availableCredits,
      fuelPerDistance: npc.fuelUse * FUEL_DISTANCE_SCALE,
      locationPosition: (id) =>
        id === npc.locationId ? this.livePosition(npc) : npcOrbitDestination(this.world, npc, id),
    });
    if (!planned) return null;
    return {
      distance: planned.totalDistance,
      refuelCost: planned.fuelCost,
      fuelExpense: Math.ceil(planned.totalFuel * FUEL_PRICE_PER_UNIT),
    };
  };
  requestTravel = (
    npc: SectorNpcState,
    destinationId: string,
    reason: string | undefined = 'Flug'
  ): boolean => {
    if (
      npc.travel ||
      npc.combatMovement ||
      destinationId === npc.locationId ||
      npc.hullHp <= 0 ||
      (npcNeedsSafeReturn(npc) &&
        destinationId !==
          (npc.pirate
            ? npc.factionId === 'pirates2'
              ? 'gallows-anchor'
              : 'blackjaw-outpost'
            : npc.homePortId)) ||
      (npc.combatRecoverySeconds ?? 0) > 0
    ) {
      return false;
    }
    if (!this.world.locations.some((location) => location.id === destinationId)) return false;
    const itinerary = planFuelRoute({
      world: this.world,
      fromId: npc.locationId,
      fromPosition: this.livePosition(npc),
      destinationId,
      profile: routeProfile(npc),
      fuel: npc.fuel,
      capacity: npc.fuelCapacity,
      credits: npc.credits,
      fuelPerDistance: npc.fuelUse * FUEL_DISTANCE_SCALE,
      locationPosition: (id) =>
        id === npc.locationId ? this.livePosition(npc) : npcOrbitDestination(this.world, npc, id),
    });
    if (!itinerary) return false;
    const stops = itinerary.stopIds;
    const next = itinerary.legs[0]?.destinationId;
    if (!next) return false;
    const activity = stops.length > 0 ? reason + ' · Tankstopp' : reason;
    return this.startLeg(npc, next, destinationId, stops, activity);
  };
  requestPatrol = (npc: SectorNpcState): boolean => {
    if (
      (npc.job !== 'patrol' && !npc.pirate) ||
      npc.travel ||
      npc.combatMovement ||
      npc.hullHp <= 0 ||
      (!npc.pirate && npcNeedsSafeReturn(npc)) ||
      (npc.combatRecoverySeconds ?? 0) > 0
    ) {
      return false;
    }
    if (npc.pirate) {
      const homeId = npc.factionId === 'pirates2' ? 'gallows-anchor' : 'blackjaw-outpost';
      const lootUnits = Object.values(npc.cargo).reduce(
        (sum, amount) => sum + Math.max(0, Math.floor(amount)),
        0
      );
      if (lootUnits > 0 && npc.locationId !== homeId) {
        return this.requestTravel(npc, homeId, 'Rückflug · Beute verkaufen');
      }
      const target = pirateHuntDestination(
        this.world,
        npc,
        this.npcs,
        this.livePosition,
        (destinationId) => this.quoteTravel(npc, destinationId)
      );
      if (!target) {
        npc.activityId = 'dock';
        npc.activity = 'Kein wirtschaftlich tragfähiges Jagdrevier';
        return false;
      }
      const retreating = target === homeId;
      const accepted = this.requestTravel(
        npc,
        target,
        retreating ? 'Rückzug · Betriebsmittel sichern' : 'Auf Beutezug · Jagdrevier'
      );
      if (!accepted && retreating) {
        npc.activityId = 'maintenance';
        npc.activity = 'Rückzug nicht finanzierbar';
      }
      return accepted;
    }
    const target = patrolDestination(this.world, npc);
    return target ? this.requestTravel(npc, target, 'Sicherheitspatrouille') : false;
  };
  startPursuit = (
    npc: SectorNpcState,
    targetKind: NpcCombatTargetKind,
    targetId: string,
    position: WorldPoint,
    reason: string | undefined = 'Verfolgung'
  ): boolean => {
    return this.beginCombatMovement(npc, 'pursue', targetKind, targetId, position, reason);
  };
  startFlee = (
    npc: SectorNpcState,
    targetKind: NpcCombatTargetKind,
    targetId: string,
    position: WorldPoint,
    reason: string | undefined = 'Flucht'
  ): boolean => {
    return this.beginCombatMovement(npc, 'flee', targetKind, targetId, position, reason);
  };
  markEngaged = (
    npc: SectorNpcState,
    targetKind: NpcCombatTargetKind,
    targetId: string,
    reason: string | undefined = 'Gefecht'
  ): void => {
    const position = this.livePosition(npc);
    const headingRadians = this.liveHeading(npc);
    delete npc.travel;
    npc.combatMovement = {
      mode: 'engaged',
      targetKind,
      targetId,
      position: { ...position },
      headingRadians,
      speed: 0,
    };
    npc.activityId = 'combat';
    npc.activity = reason;
  };
  recoverFromCombat = (npc: SectorNpcState, reason: string | undefined = 'Rückzug'): boolean => {
    const movement = npc.combatMovement;
    const position = movement ? { ...movement.position } : this.livePosition(npc);
    if (npc.hullHp <= 0) return this.beginCombatRecovery(npc, position, reason);
    if (!movement) return false;
    delete npc.combatMovement;
    const destinationId = nearestLocation(this.world, position);
    if (!destinationId) return false;
    return this.startDeepSpaceLeg(npc, position, destinationId, reason);
  };
  combatMode = (npc: SectorNpcState): NpcCombatMovementMode | null => {
    return npc.combatMovement?.mode ?? null;
  };
  isTravelling = (npc: SectorNpcState): boolean => {
    return Boolean(npc.travel || npc.combatMovement);
  };
  livePosition = (npc: SectorNpcState): WorldPoint => {
    if (npc.combatMovement) return npc.combatMovement.position;
    return npc.travel
      ? routePoint(npc.travel.routePoints, npc.travel.distanceTravelled)
      : npcOrbitPosition(this.world, npc);
  };
  liveHeading = (npc: SectorNpcState): number => {
    if (npc.combatMovement) return npc.combatMovement.headingRadians;
    return npc.travel
      ? routeHeading(npc.travel.routePoints, npc.travel.distanceTravelled)
      : npcOrbitHeading(this.world, npc);
  };
  private advanceTravel = (npc: SectorNpcState, dt: number): void => {
    const travel = npc.travel;
    if (!travel) {
      serviceIdleNpc(this.world, npc, this.options);
      return;
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

    if (travel.distanceTravelled + 0.001 < travel.routeDistance) return;

    npc.locationId = travel.targetLocationId;
    const arrivalBerth = npcOrbitStateFor(this.world, npc, npc.locationId);
    npc.orbit =
      arrivalBerth.radius > 0
        ? arrivalBerth
        : {
            locationId: npc.locationId,
            center: routePoint(travel.routePoints, travel.routeDistance),
            radius: 0,
            angleRadians: 0,
          };
    const finalTargetId = travel.finalTargetId;
    const reachedFinal = npc.locationId === finalTargetId;
    const remainingStops =
      travel.refuelStops[0] === npc.locationId ? travel.refuelStops.slice(1) : travel.refuelStops;
    delete npc.travel;
    npc.successfulRuns += 1;

    const arrival = this.world.locations.find((location) => location.id === npc.locationId);
    if (reachedFinal && isServicedPort(arrival)) payNpcPatrolContract(npc);
    serviceNpcAtLocation(this.world, npc);

    if (!reachedFinal) {
      const nextTarget = remainingStops[0] ?? finalTargetId;
      if (
        !this.startLeg(npc, nextTarget, finalTargetId, remainingStops, 'Weiterflug nach Tankstopp')
      ) {
        npc.activityId = 'dock';
        npc.activity = 'Tankstopp · nicht genügend Treibstoff';
      }
    } else {
      npc.activityId = npc.pirate ? 'raiding' : npc.job === 'patrol' ? 'patrol' : 'dock';
      npc.activity = npc.pirate
        ? 'Auf Beutezug'
        : npc.job === 'patrol'
          ? 'Sicherheitspatrouille'
          : 'Liegezeit';
    }
  };
  tick = (deltaSeconds: number): void => {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const dt = Math.min(deltaSeconds, 0.25);
    const npcPositions = new Map(this.npcs.map((npc) => [npc.id, this.livePosition(npc)]));
    const playerPosition = this.options.getPlayerPosition?.() ?? null;

    for (const npc of this.npcs) {
      if (this.advanceCombatRecovery(npc, dt)) continue;
      if (npc.hullHp <= 0) {
        this.beginCombatRecovery(npc, this.livePosition(npc), 'Notbergung');
        continue;
      }
      const movement = npc.combatMovement;
      if (movement) {
        const target = this.targetPosition(movement, npcPositions, playerPosition);
        if (target) advanceNpcCombatMovement(this.world, npc, target, dt);
        continue;
      }

      if (!npc.travel) advanceNpcOrbit(this.world, npc, dt);
      this.advanceTravel(npc, dt);
    }
  };
}

export function createNpcSectorService(
  world: WorldMap,
  npcs: readonly SectorNpcState[],
  options: NpcSectorServiceOptions = {}
): NpcSectorService {
  return new SectorService(world, npcs, options);
}
