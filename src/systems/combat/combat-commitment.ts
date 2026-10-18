import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { clamp, distance, normalize } from './strategic-combat-geometry';

const RETHINK_PERIOD = 8;

/** Comparable combat power: only equipment installed on this particular vessel counts. */
function combatPower(ship: MutableCombatant, opponent: MutableCombatant): number {
  const hull = clamp(ship.hullHp / Math.max(1, ship.hullMaxHp), 0, 1);
  const shield = clamp(ship.shieldHp / Math.max(1, ship.shieldMaxHp), 0, 1);
  const turns = ship.setup.turnRateRadiansPerSecond ?? 0.72;
  const speed = ship.subsystems.engine > 0 ? (ship.setup.combatSpeed ?? 120) : 0;
  const speedFactor = clamp(0.75 + speed / 550 + turns / 10, 0.6, 1.35);
  const range = distance(ship.position, opponent.position);
  const guns = ship.setup.weapons.reduce((sum, component) => {
    const weapon = component.weapon;
    if (!weapon) return sum;
    const damage =
      opponent.shieldHp > 0
        ? (weapon.combatShieldDamage ?? weapon.shieldDamage)
        : (weapon.combatHullDamage ?? weapon.hullDamage);
    const inRange = range <= weapon.rangeMeters ? 1 : 0.55;
    const hit = clamp(
      (ship.setup.hitChance ?? 0.7) * (1 - (opponent.setup.dodgeChance ?? 0)),
      0.1,
      1
    );
    const facing =
      weapon.mount === 'guided' || weapon.mount === 'turret'
        ? 1
        : clamp(0.65 + turns * 0.1, 0.5, 0.95);
    return sum + (damage / Math.max(0.45, weapon.cooldownSeconds)) * hit * facing * inRange;
  }, 0);
  const utility =
    (ship.subsystems.tractor > 0 && (ship.setup.tractorRangeMeters ?? 0) > 0 ? 5 : 0) +
    Math.min(14, ship.mineStock.length * 3);
  return (10 + guns + utility) * (0.22 + 0.47 * hull + 0.31 * shield) * speedFactor;
}

export function estimatedVictoryChance(ship: MutableCombatant, enemy: MutableCombatant): number {
  const ours = combatPower(ship, enemy);
  return clamp(ours / Math.max(1, ours + combatPower(enemy, ship)), 0, 1);
}

function requiredConfidence(ship: MutableCombatant, opponent: MutableCombatant): number {
  const civilianPattern = /freight|cargo|miner|mining|salvag|scaveng/;
  const role = ship.setup.shipId.toLowerCase();
  const civilian = civilianPattern.test(role);
  const otherCivilian = civilianPattern.test(opponent.setup.shipId.toLowerCase());
  // Armed working vessels should not immediately retreat from equally matched peers.
  // Against combat hulls, keep the original cautious civilian confidence threshold.
  const base = civilian
    ? otherCivilian ? 0.45 : 0.68
    : /patrol|cutter/.test(role) ? 0.32 : 0.4;
  return clamp(base - ((ship.setup.aiAggression ?? 50) - 50) * 0.0025, 0.16, 0.85);
}

/** Estimate viability of escape from the current actual motion and exit location. */
export function escapeViability(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): number {
  if (ship.subsystems.engine <= 0) return 0;
  const exit = ship.escapeGate ?? arena.exitPoint;
  if (!exit) return 0;
  const distanceToExit = distance(ship.position, exit);
  if (distanceToExit < 130) return 1;
  const direction = normalize(exit.x - ship.position.x, exit.y - ship.position.y);
  const shipSpeed = Math.max(25, ship.setup.combatSpeed ?? 120);
  const enemySpeed = enemy.subsystems.engine > 0 ? Math.max(25, enemy.setup.combatSpeed ?? 120) : 0;
  const currentProgress = ship.velocity.x * direction.x + ship.velocity.y * direction.y;
  const separation = distance(ship.position, enemy.position);
  const enemyAhead =
    (enemy.position.x - ship.position.x) * direction.x +
    (enemy.position.y - ship.position.y) * direction.y;
  const lateral = Math.abs(
    (enemy.position.x - ship.position.x) * direction.y -
      (enemy.position.y - ship.position.y) * direction.x
  );
  const blocked = enemyAhead > 0 && enemyAhead < distanceToExit && lateral < 240;
  const asteroidPenalty = (arena.obstacles ?? []).reduce((penalty, rock) => {
    const towardRock =
      (rock.position.x - ship.position.x) * direction.x +
      (rock.position.y - ship.position.y) * direction.y;
    const rockLateral = Math.abs(
      (rock.position.x - ship.position.x) * direction.y -
        (rock.position.y - ship.position.y) * direction.x
    );
    return (
      penalty +
      (towardRock > 0 && towardRock < distanceToExit && rockLateral < rock.radius + 85 ? 0.12 : 0)
    );
  }, 0);
  const acceleration = Math.max(1, ship.setup.accelerationMetersPerSecond2 ?? 34);
  const accelerationDelay = Math.max(0, shipSpeed - currentProgress) / acceleration;
  const timeToExit =
    distanceToExit / Math.max(25, shipSpeed * 0.7 + Math.max(-shipSpeed, currentProgress) * 0.3) +
    accelerationDelay;
  const pursuitTime = separation / Math.max(12, enemySpeed - shipSpeed * 0.65);
  const exposure = clamp(
    (ship.hullHp / Math.max(1, ship.hullMaxHp)) * 0.8 +
      (ship.shieldHp / Math.max(1, ship.shieldMaxHp)) * 0.2,
    0,
    1
  );
  return clamp(
    0.3 +
      0.4 * (pursuitTime / Math.max(1, timeToExit)) +
      0.25 * exposure -
      (blocked ? 0.5 : 0) -
      Math.min(0.5, asteroidPenalty),
    0,
    1
  );
}

export interface CombatCommitmentReview {
  readonly decision: 'fight' | 'flee';
  readonly victoryChance: number;
  readonly escapeChance: number;
  readonly reason: string;
}

/** Single strategic authority: only a strategy review may switch fight / flee. */
export function reviewCombatCommitment(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  elapsed: number
): CombatCommitmentReview | null {
  if (!ship.setup.aiControlled || ship.hullHp <= 0 || ship.combatTacticLocked) return null;
  // Preserve the defender's initial four-second planning offset.
  if (!ship.strategy && elapsed < ship.nextStrategyReviewAt) return null;
  // Engine loss makes escape physically impossible and overrides the ordinary review cadence.
  if (
    elapsed < (ship.nextCommitmentReviewAt ?? 0) &&
    !(ship.tactic === 'flee' && ship.subsystems.engine <= 0)
  )
    return null;
  ship.nextCommitmentReviewAt = elapsed + RETHINK_PERIOD;
  const strength = estimatedVictoryChance(ship, enemy);
  const escape = escapeViability(ship, enemy, arena);
  return chooseCommitmentTransition(ship, strength, escape, elapsed, requiredConfidence(ship, enemy));
}

function chooseCommitmentTransition(
  ship: MutableCombatant,
  strength: number,
  escape: number,
  elapsed: number,
  confidence: number
): CombatCommitmentReview | null {
  const currentlyFleeing = ship.tactic === 'flee';
  if (currentlyFleeing) {
    ship.escapeCommittedAt ??= elapsed;
    // A viable engine makes the decision final for this engagement. Changing
    // odds and temporary pursuer interception must change the escape ROUTE,
    // never silently switch the player's or NPC's flight command to attack.
    if (ship.subsystems.engine > 0) return null;
    ship.tactic = 'fight';
    ship.strategy = null;
    delete ship.escapeGate;
    delete ship.escapeAvoidanceSide;
    ship.escapeAbandonedAt = elapsed;
    return {
      decision: 'fight',
      victoryChance: strength,
      escapeChance: escape,
      reason: 'Flucht nicht mehr realistisch',
    };
  }
  // Avoid re-entering a doomed escape immediately after abandoning it.
  if (elapsed - (ship.escapeAbandonedAt ?? -10000) < 24) return null;
  if (strength < confidence && escape > 0.5) {
    ship.tactic = 'flee';
    ship.strategy = null;
    delete ship.escapeGate;
    delete ship.escapeAvoidanceSide;
    ship.escapeCommittedAt = elapsed;
    return {
      decision: 'flee',
      victoryChance: strength,
      escapeChance: escape,
      reason: 'Unterlegen und Flucht erreichbar',
    };
  }
  return null;
}

/** A defensive mine must actually intercept a pursuer behind an escaping ship. */
export function usefulEscapeMine(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  const gate = ship.escapeGate ?? arena.exitPoint;
  if (ship.tactic !== 'flee' || !gate || ship.subsystems.engine <= 0) return false;
  const towardExit = normalize(gate.x - ship.position.x, gate.y - ship.position.y);
  const rear =
    (enemy.position.x - ship.position.x) * towardExit.x +
    (enemy.position.y - ship.position.y) * towardExit.y;
  if (rear >= -75 || rear < -640) return false;
  const lateral = Math.abs(
    (enemy.position.x - ship.position.x) * towardExit.y -
      (enemy.position.y - ship.position.y) * towardExit.x
  );
  if (lateral > 160) return false;
  const relativeAdvance =
    (enemy.velocity.x - ship.velocity.x) * towardExit.x +
    (enemy.velocity.y - ship.velocity.y) * towardExit.y;
  return relativeAdvance > -10;
}
