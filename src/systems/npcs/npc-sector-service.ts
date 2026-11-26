import { isSecurityDrone, SECURITY_DRONE_SHIP_ID } from '../../core/security-drone';
import type {
  NpcCombatMovementMode,
  NpcCombatTargetKind,
  SectorNpcState,
} from '../../core/npc-types';
import type { WorldMap, WorldPoint } from '../../core/world-types';
import { getShipDefinition } from '../ships';
import { equipSecurityDroneMk3 } from '../ships/security-drone-weapon-loadout';
import { npcOperationalSpeed } from './npc-upgrade-service';
import { replanNpcTravel } from './npc-sector-live-replan';
import { advanceNpcCombatRecovery, beginNpcCombatRecovery } from './npc-sector-combat-recovery';
import { advanceNpcCombatMovement, resumeNpcFieldActivity } from './npc-sector-combat-movement';
import {
  planRouteFromPoint,
  planRouteWithProfile,
  repointRouteEndpoints,
  type RoutePlan,
} from '../navigation/route-planner';
import {
  FUEL_DISTANCE_SCALE,
  nearestLocation,
  patrolDestination,
  pirateHuntDestination,
  routeFuel,
  routeHeading,
  routePoint,
  routeProfile,
  npcRouteThreats,
} from './npc-sector-routing';
import {
  advanceNpcOrbit,
  npcOrbitDestination,
  npcOrbitHeading,
  npcOrbitPosition,
  npcOrbitStateFor,
  prepareNpcOrbitBerths,
} from './npc-orbit';
import { isServicedPort, payNpcPatrolContract } from './npc-port-servicing';
import { serviceNpcAtLocation, serviceIdleNpc } from './npc-port-economy';
import { npcNeedsSafeReturn } from './npc-operating-policy';
import { planFuelRoute } from '../navigation/fuel-route-planner';
import { FUEL_PRICE_PER_UNIT, quoteEmergencyRefuel } from '../ships/ship-operating-costs';
import type { NpcSectorService, NpcSectorServiceOptions } from './npc-sector-types';
export type { NpcSectorServiceOptions } from './npc-sector-types';
export type { NpcSectorService } from './npc-sector-types';

class SectorService implements NpcSectorService {
  constructor(
    private readonly world: WorldMap,
    readonly npcs: readonly SectorNpcState[],
    private readonly options: NpcSectorServiceOptions = {}
  ) {
    prepareNpcOrbitBerths(world, npcs);
  }
  private currentDay = 0;
  advanceDay = (day: number): void => {
    this.currentDay = Math.max(this.currentDay, Math.floor(day));
    this.options.population?.advanceDay(this.currentDay);
  };
  private buildRoute = (npc: SectorNpcState, fromId: string, toId: string): RoutePlan => {
    const from = this.livePosition(npc);
    const profile = routeProfile(npc);
    const threats = npcRouteThreats(npc, this.npcs, this.livePosition);
    const knownOrigin = this.world.locations.some((location) => location.id === fromId);
    const base = knownOrigin
      ? planRouteWithProfile(this.world, fromId, toId, profile, threats)
      : planRouteFromPoint(this.world, from, toId, profile, threats);
    return repointRouteEndpoints(base, from, npcOrbitDestination(this.world, npc, toId));
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
      planRouteFromPoint(
        this.world,
        from,
        destinationId,
        routeProfile(npc),
        npcRouteThreats(npc, this.npcs, this.livePosition)
      ),
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
  private planJourney(npc: SectorNpcState, destinationId: string, availableCredits: number) {
    const request = {
      world: this.world,
      fromId: npc.locationId,
      fromPosition: this.livePosition(npc),
      destinationId,
      profile: routeProfile(npc),
      threatContacts: npcRouteThreats(npc, this.npcs, this.livePosition),
      fuel: npc.fuel,
      capacity: npc.fuelCapacity,
      credits: availableCredits,
      fuelPerDistance: npc.fuelUse * FUEL_DISTANCE_SCALE,
      locationPosition: (id: string) =>
        id === npc.locationId ? this.livePosition(npc) : npcOrbitDestination(this.world, npc, id),
    };
    const planned = planFuelRoute(request);
    if (planned) return { planned, emergency: { units: 0, cost: 0 } };
    const location = this.world.locations.find((entry) => entry.id === npc.locationId);
    if (isServicedPort(location)) return null;
    const emergency = quoteEmergencyRefuel(npc.fuel, npc.fuelCapacity, availableCredits);
    if (emergency.units <= 0) return null;
    const rescued = planFuelRoute({
      ...request,
      fuel: Math.min(npc.fuelCapacity, npc.fuel + emergency.units),
      credits: availableCredits - emergency.cost,
    });
    return rescued ? { planned: rescued, emergency } : null;
  }
  quoteTravel = (npc: SectorNpcState, destinationId: string, availableCredits = npc.credits) => {
    if (npc.locationId === destinationId) {
      return { distance: 0, refuelCost: 0, fuelExpense: 0 };
    }
    const journey = this.planJourney(npc, destinationId, availableCredits);
    if (!journey) return null;
    const { planned, emergency } = journey;
    return {
      distance: planned.totalDistance,
      refuelCost: planned.fuelCost + emergency.cost,
      fuelExpense: Math.ceil(planned.totalFuel * FUEL_PRICE_PER_UNIT) + emergency.cost,
    };
  };
  requestTravel = (
    npc: SectorNpcState,
    destinationId: string,
    reason: string | undefined = 'Flug'
  ): boolean => {
    if (
      isSecurityDrone(npc.id) ||
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
    const journey = this.planJourney(npc, destinationId, npc.credits);
    if (!journey) return false;
    const { planned: itinerary, emergency } = journey;
    const stops = itinerary.stopIds;
    const next = itinerary.legs[0]?.destinationId;
    if (!next) return false;
    const activity = stops.length > 0 ? reason + ' · Tankstopp' : reason;
    const originalFuel = npc.fuel;
    npc.fuel = Math.min(npc.fuelCapacity, originalFuel + emergency.units);
    if (!this.startLeg(npc, next, destinationId, stops, activity)) {
      npc.fuel = originalFuel;
      return false;
    }
    npc.credits -= emergency.cost;
    if (emergency.cost > 0) npc.activity += ' · Notbetankung';
    return true;
  };
  requestPatrol = (npc: SectorNpcState): boolean => {
    if (
      isSecurityDrone(npc.id) ||
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
        if (npc.pirateHuntZoneId === npc.locationId && npc.locationId !== homeId) {
          npc.activityId = 'raiding';
          npc.activity = 'Auf Beutezug · Jagdrevier halten';
          return false;
        }
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
  recoverFromCombat = (npc: SectorNpcState, reason = 'Rückzug', remainInField = false): boolean => {
    if (npc.retiredUntilDay !== undefined) return true;
    const movement = npc.combatMovement;
    const position = movement ? { ...movement.position } : this.livePosition(npc);
    if (npc.hullHp <= 0)
      return beginNpcCombatRecovery(
        this.world,
        npc,
        position,
        reason,
        () => this.options.population?.scheduleDefeated(npc, this.currentDay) ?? false
      );
    if (!movement) return false;
    delete npc.combatMovement;
    if (remainInField || isSecurityDrone(npc.id)) return resumeNpcFieldActivity(npc, reason);
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
    if (npc.travel)
      replanNpcTravel(
        this.world,
        npc,
        () => npcRouteThreats(npc, this.npcs, this.livePosition),
        dt
      );
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
      if (npc.retiredUntilDay !== undefined) continue;
      // Do not alter a restored legacy battle's loadout mid-fight. Migrate the
      // drone as soon as the existing combat engine releases its ownership.
      if (isSecurityDrone(npc.id) && npc.shipId !== SECURITY_DRONE_SHIP_ID && !npc.combatMovement)
        equipSecurityDroneMk3(npc);
      if (advanceNpcCombatRecovery(this.world, npc, dt)) continue;
      if (npc.hullHp <= 0) {
        if (!isSecurityDrone(npc.id) || !npc.combatMovement)
          this.recoverFromCombat(npc, 'Notbergung');
        continue;
      }
      const movement = npc.combatMovement;
      if (movement) {
        const target = this.targetPosition(movement, npcPositions, playerPosition);
        if (target) advanceNpcCombatMovement(this.world, npc, target, dt);
        continue;
      }

      if (isSecurityDrone(npc.id)) {
        delete npc.travel;
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
