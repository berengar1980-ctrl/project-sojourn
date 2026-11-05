import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { getShipRoleProfile } from '../data/ships/ship-role-profiles';
import { resolveShipRuntimeSetup } from '../systems/ships';
import { fuelForDistance } from '../systems/ships/ship-operating-costs';
import { planFuelRoute } from '../systems/navigation/fuel-route-planner';

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
  return planFuelRoute({
    world,
    fromId: navigation.currentLocationId,
    fromPosition: navigation.currentPosition,
    destinationId: to,
    profile: navigation.previewRoute.profile,
    fuel: tank.fuel,
    capacity: tank.fuelCapacity,
    credits: context.economy.trade.player.credits,
    fuelPerDistance: fuelPerTravelUnit(context),
  });
}
