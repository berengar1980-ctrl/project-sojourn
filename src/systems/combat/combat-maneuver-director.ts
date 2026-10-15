import { asteroidCoverHeading } from './combat-asteroid-cover';
import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import type { CombatManeuver, CombatManeuverKind } from './combat-maneuver-types';
import { combatPlanKey, combatWeaponHeading } from './combat-weapon-posture';
import { distance, normalize, wrapAngle } from './strategic-combat-geometry';
import { combatManeuverGoal } from './combat-maneuver-goal';
import { preferredRange } from './combat-tactic-choice';

function rangeFor(ship: MutableCombatant): number {
  return ship.strategy?.desiredRange ?? preferredRange(ship);
}

function selectKind(ship: MutableCombatant, enemy: MutableCombatant): CombatManeuverKind {
  if (ship.tactic === 'flee') return 'escape';
  const range = distance(ship.position, enemy.position);
  const desired = rangeFor(ship);
  if (range < desired * 0.65) return 'extend';
  if (range > desired * 1.2) return 'intercept';
  return ship.strategy?.focus === 'broadside' ? 'pass' : 'hold';
}

function startManeuver(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  now: number,
  kind: CombatManeuverKind,
  reason: string,
  recovery = false
): CombatManeuver {
  const previous = ship.maneuver;
  const toward = normalize(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  // Both ships use the same relative passing convention: opposite WORLD lanes.
  const cover = kind === 'extend' ? asteroidCoverHeading(ship, enemy, arena) : null;
  const direction =
    cover ??
    (kind === 'extend'
      ? normalize(-toward.x - toward.y * 0.45, -toward.y + toward.x * 0.45)
      : {
          x: toward.x * (recovery ? 0.8 : 0.25) - toward.y * 0.6,
          y: toward.y * (recovery ? 0.8 : 0.25) + toward.x * 0.6,
        });
  const length =
    kind === 'extend' ? Math.max(220, rangeFor(ship) * 0.55) : Math.max(260, rangeFor(ship));
  const goal =
    kind === 'extend' || kind === 'pass'
      ? combatManeuverGoal(ship.position, enemy.position, direction, length, arena)
      : undefined;
  const maneuver: CombatManeuver = {
    kind,
    recovery,
    planKey: combatPlanKey(ship),
    reason,
    serial: (previous?.serial ?? 0) + 1,
    recoveries: (previous?.recoveries ?? 0) + (recovery ? 1 : 0),
    startedAt: now,
    lastProgressAt: now,
    bestError: Number.MAX_VALUE,
    bestAngle: Math.PI,
    lastShotAt: ship.fireControl?.lastShotAt ?? -100,
    ...(goal ? { goal } : {}),
  };
  ship.maneuver = maneuver;
  return maneuver;
}

function objectiveError(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): number {
  const maneuver = ship.maneuver!;
  if (maneuver.goal) return distance(ship.position, maneuver.goal);
  if (maneuver.kind === 'escape')
    return arena.exitPoint
      ? distance(ship.position, arena.exitPoint)
      : -distance(ship.position, enemy.position);
  return Math.abs(distance(ship.position, enemy.position) - rangeFor(ship));
}

function recordProgress(
  ship: MutableCombatant,
  maneuver: CombatManeuver,
  error: number,
  angle: number,
  now: number
): void {
  const shot = ship.fireControl?.lastShotAt ?? -100;
  const movingGoal =
    maneuver.kind === 'escape' || maneuver.kind === 'extend' || maneuver.kind === 'pass';
  const improved = error < maneuver.bestError - 15;
  const aiming = !movingGoal && angle < maneuver.bestAngle - 0.12;
  if (improved || aiming || (!movingGoal && shot > maneuver.lastShotAt)) {
    maneuver.lastProgressAt = now;
    if (improved) maneuver.bestError = error;
    if (aiming) maneuver.bestAngle = angle;
  }
  maneuver.lastShotAt = shot;
}

/** No opponent plan/status is consulted. Course corrections never create a new maneuver. */
export function updateCombatManeuver(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  now: number
): void {
  let maneuver = ship.maneuver;
  if (!maneuver || maneuver.planKey !== combatPlanKey(ship)) {
    maneuver = startManeuver(
      ship,
      enemy,
      arena,
      now,
      selectKind(ship, enemy),
      'Auftrag oder Waffenplan gewählt'
    );
  }
  const error = objectiveError(ship, enemy, arena);
  const angle = Math.abs(wrapAngle(combatWeaponHeading(ship, enemy) - ship.headingRadians));
  recordProgress(ship, maneuver, error, angle, now);
  if (maneuver.kind === 'escape' || ship.subsystems.engine <= 0) return;
  const range = distance(ship.position, enemy.position);
  const desired = rangeFor(ship);
  const complete = maneuver.goal
    ? error < 75
    : maneuver.kind === 'intercept' && range < desired * 1.08;
  const outOfEnvelope =
    maneuver.kind === 'hold' && (range > desired * 1.45 || range < desired * 0.55);
  // A passage may be aborted if the enemy has actually left the engagement envelope.
  const lostTarget = maneuver.kind === 'pass' && !maneuver.recovery && range > desired * 1.8;
  if (complete || outOfEnvelope || lostTarget) {
    startManeuver(
      ship,
      enemy,
      arena,
      now,
      selectKind(ship, enemy),
      complete ? 'Flugziel erreicht' : 'Gegner außerhalb des Feuerraums'
    );
    return;
  }
  const turnTime = angle / Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? 0.72);
  const brakeTime = ship.speed / Math.max(12, ship.setup.accelerationMetersPerSecond2 ?? 34);
  // This is a lack-of-progress watchdog, NOT a periodic maneuver timer.
  // Real range/angle progress or a shot keeps an otherwise useful order alive.
  const reload = Math.max(
    0,
    ...ship.setup.weapons.map(
      ({ weapon }) => (weapon?.cooldownSeconds ?? 0) * (ship.setup.cycleTimeMultiplier ?? 1)
    )
  );
  const stalled = now - maneuver.lastProgressAt > Math.max(6, reload + 2, turnTime + brakeTime + 2);
  if (stalled) {
    const kind = maneuver.kind === 'extend' || maneuver.kind === 'intercept' ? 'pass' : 'extend';
    startManeuver(
      ship,
      enemy,
      arena,
      now,
      kind,
      'Kein messbarer Fortschritt · neuer räumlicher Anlauf',
      true
    );
  }
}
