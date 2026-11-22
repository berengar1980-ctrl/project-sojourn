import { runtimeCombatant, runtimeEnemy } from './strategic-combat-runtime';
import { recordCombatLog } from './strategic-combat-telemetry';
import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';

/**
 * The same survivor resumes against the NEXT real opponent. The opponent's
 * AI, position and cooldowns continue to be owned by its existing service.
 * Used only by the transient FleetCombat coordinator, never regular 1vs1.
 */
export function retargetNativeFleetSurvivor(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  opponent: MutableCombatant
): boolean {
  if (runtime.winner !== side || opponent.hullHp <= 0) return false;
  if (runtime.outcomeReason !== 'destruction' && runtime.outcomeReason !== 'escape') return false;
  const survivor = runtimeCombatant(runtime, side);
  if (survivor.hullHp <= 0 || survivor === opponent || runtimeEnemy(runtime, side) === opponent)
    return false;
  return redirectNativeFleetTarget(runtime, side, opponent);
}

/** Redirect a fleet-owned ONE-SIDED actor without changing its AI owner. */
export function redirectNativeFleetTarget(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  opponent: MutableCombatant
): boolean {
  const survivor = runtimeCombatant(runtime, side);
  if (survivor.hullHp <= 0 || opponent.hullHp <= 0 || survivor === opponent) return false;
  if (runtimeEnemy(runtime, side) === opponent) return false;
  if (runtime.outcomeReason === 'boarding') return false;
  // Existing live actor objects keep their positions, shields and cooldowns.
  Object.assign(runtime, side === 'attacker' ? { defender: opponent } : { attacker: opponent });
  runtime.winner = null;
  runtime.outcomeReason = null;
  runtime.boardingInitiator = null;
  runtime.grapple = null;
  // Old guided shots must not magically switch their target mid-flight.
  runtime.projectiles.length = 0;
  runtime.beams.length = 0;
  runtime.thrownAsteroids.length = 0;
  for (let i = runtime.mines.length - 1; i >= 0; i -= 1) {
    if (runtime.mines[i]!.owner !== side) runtime.mines.splice(i, 1);
  }
  survivor.strategy = null;
  survivor.nextStrategyReviewAt = runtime.elapsedSeconds;
  survivor.asteroidRoute = [];
  survivor.nextAsteroidRouteAt = 0;
  delete survivor.flightPass;
  runtime.lastEvent = survivor.setup.name + ': NEUES ZIEL ' + opponent.setup.name;
  recordCombatLog(runtime, side, 'action', 'FLEET_RETARGET ' + opponent.setup.id);
  return true;
}
