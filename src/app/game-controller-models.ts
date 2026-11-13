import type { ShipDefinition } from '../core/ship-types';

import type { SystemLogService } from '../core/system-log-types';

import {
  engineSpeedMultiplier,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';

import { createSystemLogService } from '../systems/system-log/system-log-service';

import { runSceneZoomTransition } from '../ui/scene-transition';

import { createControllerStarModel } from './game-controller-star-map';
import { forecastPlayerFuelRoute, fuelPerTravelUnit } from './game-controller-fuel-forecast';
import { assessRouteRisk } from '../systems/navigation/route-safety';
import { pirateThreatStrength } from '../systems/npcs/npc-pirate-classes';
import { visibleFuelJourneyRoute } from './fuel-journey-route-view';

import type { ControllerRuntimeContext, SceneMode } from './game-controller-runtime-types';

import {
  createControllerLocalModel,
  miningLocationById,
  salvageLocationById,
} from './game-controller-local-model';

export function createControllerLog(): SystemLogService {
  const log = createSystemLogService();
  log.write('SYSTEM ONLINE');
  return log;
}

export function createStarMapReturnAction(
  root: HTMLElement,
  systemLog: SystemLogService,
  mountStarMap: () => void
): () => void {
  return () => {
    systemLog.write('NAV > STERNKARTE');
    runSceneZoomTransition(root, mountStarMap);
  };
}

export function localSeed(visit: number): number {
  return (Date.now() + visit * 2654435761) >>> 0;
}

export function enteredMiningLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && miningLocationById(currentId) !== null;
}

export function enteredSalvageLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && salvageLocationById(currentId) !== null;
}

export function controllerShipRuntimeOptions(
  context: ControllerRuntimeContext,
  ship: ShipDefinition = context.state.activeShip
): ShipRuntimeOptions {
  return {
    ...context.crew.runtimeOptions(ship),
    installed: context.loadouts.get(ship),
  };
}

/** Dynamic traffic changes route exposure, never a location's permanent danger level. */
export function updateSectorNavigationThreats(context: ControllerRuntimeContext): void {
  const { economy } = context;
  // Current pirate raids and patrol cover affect navigation, not the permanent map zones.
  context.navigation.setThreatContacts(
    context.world.inForeignSystem()
      ? []
      : economy.sectorNpcs.npcs
          .filter((npc) => npc.hullHp > 0 && (npc.pirate || npc.job === 'patrol'))
          .map((npc) => ({
            position: economy.sectorNpcs.livePosition(npc),
            kind: npc.pirate ? ('pirate' as const) : ('patrol' as const),
            strength: pirateThreatStrength(npc),
          }))
  );
}

export function syncControllerNavigationCrewPerformance(context: ControllerRuntimeContext): void {
  const ship = context.state.activeShip;
  const runtime = resolveShipRuntimeSetup(ship, controllerShipRuntimeOptions(context, ship));
  const drive = engineSpeedMultiplier(runtime.installed);
  context.navigation.setCruiseSpeed(
    ship.navigation.cruiseSpeed * drive * runtime.crewEffects.piloting.travelSpeedMultiplier,
    drive * runtime.crewEffects.piloting.turnRateMultiplier
  );
}

export function controllerStarModel(context: ControllerRuntimeContext) {
  const runtime = resolveShipRuntimeSetup(
    context.state.activeShip,
    controllerShipRuntimeOptions(context)
  );
  const base = createControllerStarModel(
    context.navigation,
    context.state.activeShip,
    context.economy,
    context.state.selectedNpcId,
    runtime.sensorCrewSkill,
    runtime.sensorModifier,
    context.world.world(),
    context.world.inForeignSystem(),
    runtime.crewEffects.logistics.saleFeeRate
  );
  const tank = context.shipOperations.snapshot(context.state.activeShip, runtime.hullMaxHp);
  const forecast = forecastPlayerFuelRoute(context);
  const journey = context.fuelJourney.plan();
  const planned = journey ?? forecast;
  const nav = context.navigation.getSnapshot();
  const route = journey
    ? visibleFuelJourneyRoute(journey, context.fuelJourney.snapshot().remainingIds, nav)
    : forecast?.route;
  const target = nav.selectedDestinationId;
  const worldTarget = context.world.world().locations.some((location) => location.id === target);
  return {
    ...base,
    ...(route ? { route } : {}),
    fuelStatus: {
      fuel: tank.fuel,
      capacity: tank.fuelCapacity,
      fuelPerHundred: fuelPerTravelUnit(context) * 100,
      planned,
      ...(route
        ? {
            personalRisk: {
              ...assessRouteRisk(route, nav.threatContacts, {
                hull: runtime.hullMaxHp,
                shield: runtime.shieldMaxHp,
                piloting: runtime.stationSkills.piloting,
                sensors: runtime.stationSkills.sensors,
              }),
              worldDanger: route.dangerLevel,
            },
            ...(planned
              ? {
                  estimatedSeconds:
                    planned.totalDistance /
                    Math.max(1, context.state.activeShip.navigation.cruiseSpeed),
                }
              : {}),
          }
        : {}),
      unreachable: Boolean(nav.previewRoute && worldTarget && !forecast),
    },
  };
}

export function controllerLocalModel(context: ControllerRuntimeContext) {
  const model = createControllerLocalModel(
    context.state.localSpace,
    context.state.activeShip,
    context.navigation,
    context.state.localNpcMining,
    context.state.selectedNpcId,
    context.state.embeddedCombat === 'local-space'
      ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
      : null
  ); 
  const locationId = context.state.localSpace?.getSnapshot().instance.sourceLocationId;
  const asteroidId = model.selectedAsteroid?.id;
  const owner =
    locationId && asteroidId
      ? context.economy.asteroidClaims.snapshot().claims.find(
          (entry) => entry.locationId === locationId && entry.asteroidId === asteroidId
        )?.ownerId ?? null
      : null;
  const knownClaims = context.economy.asteroidClaims.snapshot().claims.filter(
    (claim) => claim.locationId === locationId
  );
  const ownerByAsteroid = new Map(
    knownClaims.map((claim) => [claim.asteroidId, claim.ownerId])
  );
  const drone = locationId ? context.economy.securityDrones.get(locationId) : null;
  return {
    ...model,
    selectedAsteroidClaimOwner: owner,
    asteroids: model.asteroids.map((asteroid) => ({
      ...asteroid,
      claimOwnerId: ownerByAsteroid.get(asteroid.id) ?? null,
    })),
    securityDrone: drone?.snapshot() ?? null,
  };
}
