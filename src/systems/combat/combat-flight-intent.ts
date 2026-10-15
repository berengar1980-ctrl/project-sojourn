import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import { normalize } from './strategic-combat-geometry';
import { mineBaitManeuver, pursuitManeuver } from './combat-tactical-maneuvers';

type FlightKind = 'escape' | 'ram' | 'pursuit' | 'minefield' | 'intercept' | 'pass' | 'extend';

export interface CombatFlightIntent {
  readonly direction: CombatPoint;
  readonly speedFactor: number;
  readonly kind: FlightKind;
}

/**
 * One independent flight intention per ship. No paired action/reaction table,
 * waypoint arrival or time-driven choreography. Flight uses existing physics.
 */
export function chooseCombatFlightIntent(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  desiredRange: number,
  arena: StrategicCombatArenaOptions,
  deltaSeconds: number,
  deliberateRam: boolean
): CombatFlightIntent {
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const range = Math.max(1, Math.hypot(dx, dy));
  const toward = normalize(dx, dy);
  const away = { x: -toward.x, y: -toward.y };
  const side = { x: -toward.y, y: toward.x };

  if (ship.tactic === 'flee') {
    delete ship.flightPass;
    const exit = arena.exitPoint;
    const direction = exit ? normalize(exit.x - ship.position.x, exit.y - ship.position.y) : away;
    return { kind: 'escape', direction, speedFactor: 1 };
  }
  if (deliberateRam) {
    delete ship.flightPass;
    return { kind: 'ram', direction: toward, speedFactor: 1 };
  }
  const pursuing = pursuitManeuver(ship, enemy);
  if (pursuing) {
    delete ship.flightPass;
    return { kind: 'pursuit', direction: pursuing.direction, speedFactor: pursuing.speedFactor };
  }
  const minefield = mineBaitManeuver(ship, enemy);
  if (minefield) {
    delete ship.flightPass;
    return {
      kind: 'minefield',
      direction: minefield.direction,
      speedFactor: minefield.speedFactor,
    };
  }

  const pass = ship.flightPass;
  if (pass) {
    pass.ageSeconds += deltaSeconds;
    pass.closestRange = Math.min(pass.closestRange, range);
    const along = dx * pass.direction.x + dy * pass.direction.y;
    const crossed = along < -70 && range > pass.closestRange + 90;
    const blocked = pass.ageSeconds > 14 && range < pass.startRange * 0.6;
    if (!crossed && !blocked && pass.ageSeconds < 20) {
      return { kind: 'pass', direction: pass.direction, speedFactor: 0.92 };
    }
    delete ship.flightPass;
  }

  // A ship inside its minimum useful firing envelope must not be ordered
  // towards the enemy by a separate forward-weapon alignment rule.
  if (range < Math.max(155, desiredRange * 0.62)) {
    return {
      kind: 'extend',
      direction: normalize(away.x + side.x * 0.4, away.y + side.y * 0.4),
      speedFactor: 0.88,
    };
  }

  const relativeClosing =
    (ship.velocity.x - enemy.velocity.x) * toward.x +
    (ship.velocity.y - enemy.velocity.y) * toward.y;
  const canPass = ship.subsystems.engine > 0 && range <= desiredRange * 1.12;
  if (canPass && relativeClosing > 14) {
    const lead = Math.min(1.2, range / Math.max(65, ship.setup.combatSpeed ?? 120) * 0.2);
    const direction = normalize(
      dx + enemy.velocity.x * lead + side.x * Math.min(250, range * 0.36),
      dy + enemy.velocity.y * lead + side.y * Math.min(250, range * 0.36)
    );
    ship.flightPass = {
      direction,
      startRange: range,
      closestRange: range,
      ageSeconds: 0,
    };
    return { kind: 'pass', direction, speedFactor: 0.92 };
  }

  if (range < desiredRange * 1.2) {
    // Keep traversing the engagement rather than braking at a fixed range.
    const radial = Math.max(-0.55, Math.min(0.55, (range - desiredRange) / desiredRange));
    return {
      kind: 'intercept',
      direction: normalize(side.x + toward.x * radial, side.y + toward.y * radial),
      speedFactor: 0.75,
    };
  }
  return {
    kind: 'intercept',
    direction: normalize(dx + enemy.velocity.x * 0.6, dy + enemy.velocity.y * 0.6),
    speedFactor: 0.95,
  };
}
