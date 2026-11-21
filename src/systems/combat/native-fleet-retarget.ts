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
  if (side === 'attacker') runtime.defender = opponent;
  else runtime.attacker = opponent;
  runtime.winner = null;
  runtime.outcomeReason = null;
  runtime.boardingInitiator = null;
  runtime.grapple = null;
  runtime.projectiles = [];
  runtime.beams = [];
  runtime.thrownAsteroids = [];
  runtime.mines = runtime.mines.filter((mine) => mine.owner === side);
  survivor.strategy = null;
  survivor.nextStrategyReviewAt = runtime.elapsedSeconds;
  survivor.asteroidRoute = [];
  delete survivor.flightPass;
  runtime.lastEvent = survivor.setup.name + ': NEUES ZIEL ' + opponent.setup.name;
  recordCombatLog(runtime, side, 'action', 'FLEET_RETARGET ' + opponent.setup.id);
  return true;
}
