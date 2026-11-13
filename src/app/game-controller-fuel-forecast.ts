import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { getShipRoleProfile } from '../data/ships/ship-role-profiles';
import { resolveShipRuntimeSetup } from '../systems/ships';
import { fuelForDistance } from '../systems/ships/ship-operating-costs';
import { planFuelRoute, type FuelRoutePlan } from '../systems/navigation/fuel-route-planner';
import { navigationOrbitalBerth } from '../systems/navigation/orbital-berth';

type ForecastCacheEntry = { key: string; plan: FuelRoutePlan | null };
const forecastCache = new WeakMap<ControllerRuntimeContext, ForecastCacheEntry>();

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

export function forecastPlayerFuelRoute(context: ControllerRuntimeContext) {
  const navigation = context.navigation.getSnapshot();
  const world = context.world.world();
  const to = navigation.selectedDestinationId;
  if (!to || !world.locations.some((location) => location.id === to)) return null;
  if (!navigation.previewRoute) return null;
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
    navigation.previewRoute.profile,
    navigation.threatRevision,
    ship.id,
    tank.fuel,
    tank.fuelCapacity,
    credits,
    fuelPerDistance,
  ].join('|');
  const cached = forecastCache.get(context);
  if (cached?.key === key) return cached.plan;
  const plan = planFuelRoute({
    world,
    fromId: navigation.currentLocationId,
    fromPosition: navigation.currentPosition,
    destinationId: to,
    profile: navigation.previewRoute.profile,
    threatContacts: navigation.threatContacts,
    fuel: tank.fuel,
    capacity: tank.fuelCapacity,
    credits,
    fuelPerDistance,
    locationPosition: (id) => navigationOrbitalBerth(world, id),
  });
  forecastCache.set(context, { key, plan });
  return plan;
}
