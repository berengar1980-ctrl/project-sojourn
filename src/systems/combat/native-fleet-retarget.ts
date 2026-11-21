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
  if (
    survivor.hullHp <= 0 ||
    survivor === opponent ||
    runtimeEnemy(runtime, side) === opponent
  ) return false;
  // Preserve the immutable runtime container and all existing ship objects;
  // only the fleet-owned opponent reference may change after a completed duel.
  Object.assign(runtime, side === 'attacker' ? { defender: opponent } : { attacker: opponent });
  runtime.winner = null;
  runtime.outcomeReason = null;
  runtime.boardingInitiator = null;
  runtime.grapple = null;
  runtime.projectiles.length = 0;
  runtime.beams.length = 0;
  runtime.thrownAsteroids.length = 0;
  for (let i = runtime.mines.length - 1; i >= 0; i -= 1) {
    if (runtime.mines[i]!.owner !== side) runtime.mines.splice(i, 1);
  }
  survivor.strategy = null;
  survivor.nextStrategyReviewAt = runtime.elapsedSeconds;
  survivor.asteroidRoute = [];
  delete survivor.flightPass;
  runtime.lastEvent = survivor.setup.name + ': NEUES ZIEL ' + opponent.setup.name;
  recordCombatLog(runtime, side, 'action', 'FLEET_RETARGET ' + opponent.setup.id);
  return true;
}
