import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import type { NavigationSnapshot } from '../systems/navigation/navigation-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerShipRuntimeOptions } from './game-controller-models';
import { resolveShipRuntimeSetup } from '../systems/ships';

export function canStartPlayerTravel(context: ControllerRuntimeContext): boolean {
  const { activeShip } = context.state;
  const route = context.navigation.getSnapshot().previewRoute;
  if (!route) return true;
  const effects = resolveShipRuntimeSetup(
    activeShip,
    controllerShipRuntimeOptions(context, activeShip)
  ).crewEffects;
  const available = context.shipOperations.hasFuelForRoute(
    activeShip,
    route.distance,
    effects.piloting.fuelUseMultiplier,
    effects.engineering.fuelUseMultiplier
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
  const distance = Math.hypot(
    after.currentPosition.x - before.currentPosition.x,
    after.currentPosition.y - before.currentPosition.y
  );
  if (distance <= 0) return;
  const ship = context.state.activeShip;
  const effects = resolveShipRuntimeSetup(
    ship,
    controllerShipRuntimeOptions(context, ship)
  ).crewEffects;
  context.shipOperations.burn(
    ship, distance, effects.piloting.fuelUseMultiplier, effects.engineering.fuelUseMultiplier
  );
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
  const runtime = resolveShipRuntimeSetup(ship, controllerShipRuntimeOptions(context, ship));
  context.shipOperations.recordHull(ship, snapshot.attacker.hullHp, runtime.hullMaxHp);
}
