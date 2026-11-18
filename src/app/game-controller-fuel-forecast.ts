import { measurePerformance } from '../core/performance-diagnostics';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { getShipRoleProfile } from '../data/ships/ship-role-profiles';
import { resolveShipRuntimeSetup } from '../systems/ships';
import { fuelForDistance } from '../systems/ships/ship-operating-costs';
import { planFuelRoute, type FuelRoutePlan } from '../systems/navigation/fuel-route-planner';
import { navigationOrbitalBerth } from '../systems/navigation/orbital-berth';

type ForecastCacheEntry = {
  key: string;
  plan: FuelRoutePlan | null;
  threatRevision: number;
  computedAtMs: number;
};
const forecastCache = new WeakMap<ControllerRuntimeContext, ForecastCacheEntry>();
const THREAT_PREVIEW_REFRESH_MS = 4000;

/** Reuse previews briefly when only moving NPC contacts have changed. */
export function canReuseFuelForecast(
  cached: ForecastCacheEntry | undefined,
  key: string,
  threatRevision: number,
  nowMs: number,
  requireCurrentThreats: boolean
): boolean {
  if (!cached || cached.key !== key) return false;
  if (cached.threatRevision === threatRevision) return true;
  return !requireCurrentThreats && nowMs - cached.computedAtMs < THREAT_PREVIEW_REFRESH_MS;
}

export function fuelPerTravelUnit(context: ControllerRuntimeContext): number {
  const ship = context.state.activeShip;
  const runtime = resolveShipRuntimeSetup(ship, {
    ...context.crew.runtimeOptions(ship),
    installed: context.loadouts.get(ship),
  });
  return fuelForDistance(
    1,
    getShipRoleProfile(ship.role).fuelUse,
    runtime.crewEffects.piloting.fuelUseMultiplier,
    runtime.crewEffects.engineering.fuelUseMultiplier
  );
}

export function forecastPlayerFuelRoute(
  context: ControllerRuntimeContext,
  requireCurrentThreats = false
) {
  const navigation = context.navigation.getSnapshot();
  const world = context.world.world();
  const to = navigation.selectedDestinationId;
  if (!to || !world.locations.some((location) => location.id === to)) return null;
  const preview = navigation.previewRoute;
  if (!preview) return null;
  const ship = context.state.activeShip;
  const tank = context.shipOperations.snapshot(ship, 1);
  const fuelPerDistance = fuelPerTravelUnit(context);
  const credits = context.economy.trade.player.credits;
  const key = [
    world.id,
    world.locations.length,
    navigation.currentLocationId,
    navigation.currentPosition.x,
    navigation.currentPosition.y,
    to,
    preview.profile,
    ship.id,
    tank.fuel,
    tank.fuelCapacity,
    credits,
    fuelPerDistance,
  ].join('|');
  const cached = forecastCache.get(context);
  if (
    canReuseFuelForecast(
      cached,
      key,
      navigation.threatRevision,
      performance.now(),
      requireCurrentThreats
    )
  )
    return cached!.plan;
  const plan = measurePerformance('navigation.fuel-route-plan', () =>
    planFuelRoute({
      world,
      fromId: navigation.currentLocationId,
      fromPosition: navigation.currentPosition,
      destinationId: to,
      profile: preview.profile,
      threatContacts: navigation.threatContacts,
      fuel: tank.fuel,
      capacity: tank.fuelCapacity,
      credits,
      fuelPerDistance,
      locationPosition: (id) => navigationOrbitalBerth(world, id),
    })
  );
  forecastCache.set(context, {
    key,
    plan,
    threatRevision: navigation.threatRevision,
    computedAtMs: performance.now(),
  });
  return plan;
}
