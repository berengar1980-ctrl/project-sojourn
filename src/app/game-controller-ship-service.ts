import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import type { NavigationSnapshot } from '../systems/navigation/navigation-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerShipRuntimeOptions } from './game-controller-models';
import { resolveShipRuntimeSetup } from '../systems/ships';
import type { ShipDefinition } from '../core/ship-types';
import type { CrewRosterService } from '../systems/crew';
import type { ShipLoadoutService } from '../systems/ships';
import type { ShipOperatingService } from '../systems/ships/ship-operating-costs';
import { createPlayerCombatant } from './game-controller-combat';
import { canFuelAt } from '../systems/navigation/fuel-route-planner';
import { forecastPlayerFuelRoute } from './game-controller-fuel-forecast';

function liveFuelMultipliers(context: ControllerRuntimeContext) {
  const ship = context.state.activeShip;
  const options = controllerShipRuntimeOptions(context, ship);
  const effects = resolveShipRuntimeSetup(ship, options).crewEffects;
  return {
    piloting: effects.piloting.fuelUseMultiplier,
    engineering: effects.engineering.fuelUseMultiplier,
  };
}

export function canStartPlayerTravel(context: ControllerRuntimeContext): boolean {
  const ship = context.state.activeShip;
  const route = context.navigation.getSnapshot().previewRoute;
  if (!route) return true;
  const fuel = liveFuelMultipliers(context);
  const available = context.shipOperations.hasFuelForRoute(
    ship,
    route.distance,
    fuel.piloting,
    fuel.engineering
  );
  if (!available) {
    context.systemLog.write('TREIBSTOFF > REICHWEITE NICHT AUSREICHEND · ZUERST TANKEN');
  }
  return available;
}

/** Consume measured distance, never elapsed idle time or teleport distance. */
export function advancePlayerFuel(
  context: ControllerRuntimeContext,
  before: NavigationSnapshot,
  after: NavigationSnapshot
): void {
  if (!before.isTravelling) return;
  const dx = after.currentPosition.x - before.currentPosition.x;
  const dy = after.currentPosition.y - before.currentPosition.y;
  const progress = after.activeRoute
    ? Math.max(0, after.progress - before.progress)
    : 1 - before.progress;
  const distance = before.activeRoute
    ? before.activeRoute.distance * progress
    : Math.hypot(dx, dy);
  if (distance <= 0) return;
  const ship = context.state.activeShip;
  const fuel = liveFuelMultipliers(context);
  context.shipOperations.burn(ship, distance, fuel.piloting, fuel.engineering);
  if (before.isPursuing && context.shipOperations.snapshot(ship, 1).fuel <= 0) {
    context.navigation.stopPursuit();
    context.systemLog.write('TREIBSTOFF > TANK LEER · VERFOLGUNG ABGEBROCHEN');
  }
}

export function recordPlayerCombatHull(
  context: ControllerRuntimeContext,
  snapshot: StrategicCombatSnapshot
): void {
  const ship = context.state.activeShip;
  const options = controllerShipRuntimeOptions(context, ship);
  const runtime = resolveShipRuntimeSetup(ship, options);
  context.shipOperations.recordHull(ship, snapshot.attacker.hullHp, runtime.hullMaxHp);
}

/** Docking and docked market transactions share the same automatic top-up. */
export function refuelAtPort(context: ControllerRuntimeContext): void {
  const locationId = context.navigation.getSnapshot().currentLocationId;
  if (!locationId || !context.economy.markets.getMarket(locationId)) return;
  const purchased = context.shipOperations.refuel(context.state.activeShip);
  if (purchased.cost === 0) return;
  context.systemLog.write(
    'TREIBSTOFF > +' + purchased.units.toFixed(1) + ' · -' + purchased.cost + ' CR'
  );
}

/** Spawn with the persistent hull condition, not an automatically repaired hull. */
export function servicedPlayerCombatant(
  ship: ShipDefinition,
  crew: CrewRosterService,
  loadouts: ShipLoadoutService,
  operations: ShipOperatingService
) {
  const setup = createPlayerCombatant(ship, {
    ...crew.runtimeOptions(ship),
    installed: loadouts.get(ship),
  });
  return {
    ...setup,
    hullHp: Math.max(1, operations.snapshot(ship, setup.hullHp).hullHp),
  };
}

/** Starts every planned refueling leg instead of blocking long but serviceable routes. */
export function startPlayerFuelTravel(context: ControllerRuntimeContext): boolean {
  const navigation = context.navigation;
  const selected = navigation.getSnapshot().selectedDestinationId;
  const isStatic = context.world.world().locations.some((location) => location.id === selected);
  if (!isStatic) {
    if (!canStartPlayerTravel(context)) return false;
    context.fuelJourney.cancel();
    navigation.startTravel();
    return true;
  }
  const plan = forecastPlayerFuelRoute(context);
  if (!plan) {
    context.systemLog.write('TREIBSTOFF > ROUTE NICHT ERREICHBAR · REICHWEITE ODER CREDITS');
    return false;
  }
  if (!context.fuelJourney.start(plan, navigation)) return false;
  if (plan.stopIds.length > 0) {
    context.systemLog.write('NAV > ' + plan.stopIds.length + ' TANKSTOPP(S) EINGEPLANT');
  }
  return true;
}

/** Called once on completion of a real intermediate leg; paid refill precedes departure. */
export function processPlayerFuelStop(
  context: ControllerRuntimeContext,
  before: NavigationSnapshot,
  after: NavigationSnapshot
): boolean {
  const journey = context.fuelJourney.plan();
  if (!journey || !before.isTravelling || after.isTravelling) return false;
  const at = after.currentLocationId;
  const pending = context.fuelJourney.snapshot().remainingIds;
  if (!at || at !== pending[0]) return false;
  if (!journey.stopIds.includes(at)) {
    context.fuelJourney.arrived(at, context.navigation, () => true);
    return false;
  }
  const dock = context.world.world().locations.find((location) => location.id === at);
  if (!canFuelAt(dock)) {
    context.fuelJourney.cancel();
    return true;
  }
  const refilled = context.shipOperations.refuel(context.state.activeShip);
  const amount = refilled.units.toFixed(1);
  const message = 'TANKSTOPP > ' + dock!.name.toUpperCase();
  context.systemLog.write(message + ' · +' + amount + ' TREIBSTOFF · ' + refilled.cost + ' CR');
  const nextLeg = journey.legs.find((leg) => leg.destinationId === pending[1]);
  const multipliers = liveFuelMultipliers(context);
  const canContinue = Boolean(
    nextLeg &&
      context.shipOperations.hasFuelForRoute(
        context.state.activeShip,
        nextLeg.route.distance,
        multipliers.piloting,
        multipliers.engineering
      )
  );
  context.fuelJourney.arrived(at, context.navigation, () => canContinue);
  if (!canContinue) {
    context.systemLog.write('TANKSTOPP > REISE PAUSIERT · TREIBSTOFF ODER CREDITS FEHLEN');
  }
  return true;
}

export function tickPlayerFuelJourney(
  context: ControllerRuntimeContext,
  before: NavigationSnapshot,
  after: NavigationSnapshot
): boolean {
  advancePlayerFuel(context, before, after);
  return processPlayerFuelStop(context, before, after);
}
