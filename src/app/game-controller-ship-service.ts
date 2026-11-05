import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import type { NavigationSnapshot } from '../systems/navigation/navigation-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerShipRuntimeOptions } from './game-controller-models';
import { resolveShipRuntimeSetup } from '../systems/ships';

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
  const distance = Math.hypot(dx, dy);
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
