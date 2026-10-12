import { distance, normalize } from './strategic-combat-geometry';
import type {
  MutableCombatant,
  StrategicCombatRuntime,
  StrategicCombatSide,
} from './strategic-combat-types';

const THROW_SPEED = 420;
const MAX_RANGE = 700;
const COOLDOWN = 16;

/** Redirect a previously deployed mine using the same tractor eligibility and
 * cooldown as an asteroid throw. Existing mine arming and damage stay authoritative.
 */
export function maybeThrowTractorMine(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  ship: MutableCombatant,
  enemy: MutableCombatant
): boolean {
  if (ship.shieldHp > 0 || ship.subsystems.tractor <= 0 || ship.tactic === 'flee') return false;
  if ((ship.tractorThrowCooldown ?? 0) > 0 || enemy.hullHp <= 0) return false;
  const reach = Math.min(MAX_RANGE, ship.setup.tractorRangeMeters ?? 0);
  if (reach <= 0 || distance(ship.position, enemy.position) > 1200) return false;
  const mine = runtime.mines
    .filter((candidate) => candidate.owner === side && candidate.armedSeconds <= 0)
    .filter((candidate) => !candidate.tractorVelocity)
    .filter((candidate) => distance(ship.position, candidate.position) <= reach)
    .sort((a, b) => distance(a.position, enemy.position) - distance(b.position, enemy.position))[0];
  if (!mine) return false;
  const travel = distance(mine.position, enemy.position) / THROW_SPEED;
  const aim = normalize(
    enemy.position.x + enemy.velocity.x * travel - mine.position.x,
    enemy.position.y + enemy.velocity.y * travel - mine.position.y
  );
  mine.tractorVelocity = { x: aim.x * THROW_SPEED, y: aim.y * THROW_SPEED };
  mine.tractorFlightSeconds = 0;
  ship.tractorThrowCooldown = COOLDOWN;
  runtime.lastEvent = ship.setup.name + ': TRAKTOR SCHLEUDERT MINE';
  runtime.combatLog.push({
    timeSeconds: Number(runtime.elapsedSeconds.toFixed(2)),
    side,
    event: 'action',
    detail: 'TRACTOR_MINE_THROW ' + mine.definition.id + ' #' + mine.id,
  });
  return true;
}
