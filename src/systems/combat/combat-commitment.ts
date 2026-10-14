import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { clamp, distance, normalize } from './strategic-combat-geometry';

const MIN_ESCAPE_COMMITMENT = 16;
const RETHINK_PERIOD = 8;

function relativeStrength(ship: MutableCombatant, enemy: MutableCombatant): number {
  const power = (s: MutableCombatant): number => {
    const shield = s.shieldHp / Math.max(1, s.shieldMaxHp);
    const hull = s.hullHp / Math.max(1, s.hullMaxHp);
    const guns = s.setup.weapons.reduce((sum, item) => {
      const w = item.weapon;
      return sum + (w ? Math.max(w.combatHullDamage ?? w.hullDamage, w.combatShieldDamage ?? w.shieldDamage) /
        Math.max(0.45, w.cooldownSeconds) : 0);
    }, 0);
    const mobility = s.subsystems.engine > 0 ? 1 : 0.15;
    return (16 + guns) * (0.25 + 0.4 * hull + 0.35 * shield) * (0.7 + mobility * 0.3);
  };
  const ours = power(ship);
  return clamp(ours / Math.max(1, ours + power(enemy)), 0, 1);
}

function requiredConfidence(ship: MutableCombatant): number {
  const role = ship.setup.shipId.toLowerCase();
  const civilian = /freight|cargo|miner|mining|salvag|scaveng/.test(role);
  const base = civilian ? 0.68 : /patrol|cutter/.test(role) ? 0.32 : 0.4;
  return clamp(base - ((ship.setup.aiAggression ?? 50) - 50) * 0.0025, 0.16, 0.85);
}

/** Estimate viability of escape from the current actual motion and exit location. */
export function escapeViability(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): number {
  if (ship.subsystems.engine <= 0) return 0;
  const exit = arena.exitPoint;
  if (!exit) return 0;
  const distanceToExit = distance(ship.position, exit);
  if (distanceToExit < 130) return 1;
  const direction = normalize(exit.x - ship.position.x, exit.y - ship.position.y);
  const shipSpeed = Math.max(25, ship.setup.combatSpeed ?? 120);
  const enemySpeed = enemy.subsystems.engine > 0 ? Math.max(25, enemy.setup.combatSpeed ?? 120) : 0;
  const currentProgress = ship.velocity.x * direction.x + ship.velocity.y * direction.y;
  const separation = distance(ship.position, enemy.position);
  const enemyAhead = (enemy.position.x - ship.position.x) * direction.x +
    (enemy.position.y - ship.position.y) * direction.y;
  const lateral = Math.abs((enemy.position.x - ship.position.x) * direction.y -
    (enemy.position.y - ship.position.y) * direction.x);
  const blocked = enemyAhead > 0 && enemyAhead < distanceToExit && lateral < 240;
  const timeToExit = distanceToExit / Math.max(25, shipSpeed * 0.7 + Math.max(-shipSpeed, currentProgress) * 0.3);
  const pursuitTime = separation / Math.max(12, enemySpeed - shipSpeed * 0.65);
  const exposure = clamp((ship.hullHp / Math.max(1, ship.hullMaxHp)) * 0.8 +
    (ship.shieldHp / Math.max(1, ship.shieldMaxHp)) * 0.2, 0, 1);
  return clamp(0.3 + 0.4 * (pursuitTime / Math.max(1, timeToExit)) +
    0.25 * exposure - (blocked ? 0.5 : 0), 0, 1);
}

/** Single strategic authority: only a strategy review may switch fight / flee. */
export function reviewCombatCommitment(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  elapsed: number
): void {
  if (!ship.setup.aiControlled || ship.hullHp <= 0 || ship.combatTacticLocked) return;
  // Preserve the defender's initial four-second planning offset.
  if (!ship.strategy && elapsed < ship.nextStrategyReviewAt) return;
  if (elapsed < (ship.nextCommitmentReviewAt ?? 0)) return;
  ship.nextCommitmentReviewAt = elapsed + RETHINK_PERIOD;
  const strength = relativeStrength(ship, enemy);
  const escape = escapeViability(ship, enemy, arena);
  const currentlyFleeing = ship.tactic === 'flee';
  if (currentlyFleeing) {
    ship.escapeCommittedAt ??= elapsed;
    // Remain committed, unless escape has become almost impossible.
    if (elapsed - (ship.escapeCommittedAt ?? elapsed) < MIN_ESCAPE_COMMITMENT) {
      if (escape >= 0.12 || ship.subsystems.engine > 0) return;
    } else if (escape >= 0.2) return;
    ship.tactic = 'fight';
    ship.strategy = null;
    ship.escapeAbandonedAt = elapsed;
    return;
  }
  // Avoid re-entering a doomed escape immediately after abandoning it.
  if (elapsed - (ship.escapeAbandonedAt ?? -10000) < 24) return;
  if (strength < requiredConfidence(ship) && escape > 0.5) {
    ship.tactic = 'flee';
    ship.strategy = null;
    ship.escapeCommittedAt = elapsed;
  }
}

/** A defensive mine must actually intercept a pursuer behind an escaping ship. */
export function usefulEscapeMine(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  if (ship.tactic !== 'flee' || !arena.exitPoint || ship.subsystems.engine <= 0) return false;
  const towardExit = normalize(arena.exitPoint.x - ship.position.x,
    arena.exitPoint.y - ship.position.y);
  const rear = (enemy.position.x - ship.position.x) * towardExit.x +
    (enemy.position.y - ship.position.y) * towardExit.y;
  if (rear >= -75 || rear < -640) return false;
  const lateral = Math.abs((enemy.position.x - ship.position.x) * towardExit.y -
    (enemy.position.y - ship.position.y) * towardExit.x);
  if (lateral > 160) return false;
  const relativeAdvance = (enemy.velocity.x - ship.velocity.x) * towardExit.x +
    (enemy.velocity.y - ship.velocity.y) * towardExit.y;
  return relativeAdvance > -10;
}
