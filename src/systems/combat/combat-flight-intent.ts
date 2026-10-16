import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import { normalize, wrapAngle } from './strategic-combat-geometry';
import { weaponInArc } from './combat-weapon-geometry';
import { mineBaitManeuver, pursuitManeuver } from './combat-tactical-maneuvers';

type TacticalKind = 'escape' | 'ram' | 'pursuit' | 'minefield';
type FlightKind = TacticalKind | 'intercept' | 'pass' | 'extend';

export interface CombatFlightIntent {
  readonly direction: CombatPoint;
  readonly speedFactor: number;
  readonly kind: FlightKind;
}

/**
 * One independent flight intention per ship. No paired action/reaction table,
 * waypoint arrival or time-driven choreography. Flight uses existing physics.
 */
function continueCommittedPass(
  ship: MutableCombatant,
  range: number,
  dx: number,
  dy: number,
  dt: number
): CombatFlightIntent | null {
  const pass = ship.flightPass;
  if (!pass) return null;
  pass.ageSeconds += dt;
  pass.closestRange = Math.min(pass.closestRange, range);
  const along = dx * pass.direction.x + dy * pass.direction.y;
  const crossed = along < -70 && range > pass.closestRange + 90;
  const blocked = pass.ageSeconds > 14 && range < pass.startRange * 0.6;
  if (crossed || blocked || pass.ageSeconds >= 20) {
    delete ship.flightPass;
    return null;
  }
  return { kind: 'pass', direction: pass.direction, speedFactor: 0.92 };
}

/** A forward-gun passage starts only once the real weapon arc is aligned. */
function forwardPassReady(ship: MutableCombatant, enemy: MutableCombatant): boolean {
  if (ship.strategy?.focus !== 'forward') return true;
  const bearing = Math.atan2(
    enemy.position.y - ship.position.y,
    enemy.position.x - ship.position.x
  );
  const error = Math.abs(wrapAngle(bearing - ship.headingRadians));
  if (!Number.isFinite(error) || error > 0.25) return false;
  const forwardGuns = ship.setup.weapons
    .map((component, index) => ({ component, index }))
    .filter(({ component, index }) => {
      const weapon = component.weapon;
      if (!weapon) return false;
      const mount = ship.setup.weaponMounts?.find((point) => point.slotIndex === index);
      const fixedGun = weapon.mount === 'forward' || weapon.family === 'railgun';
      const forwardFacing = !mount?.facing || mount.facing === 'forward';
      return fixedGun && forwardFacing;
    });
  return forwardGuns.every(({ component, index }) => {
    return weaponInArc(ship, enemy.position, index, component.weapon!);
  });
}

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
  const starboard =
    ship.strategy?.focus === 'broadside' && ship.strategy.broadsideFacing === 'starboard';
  const orbitSign = starboard ? -1 : 1;
  const side = { x: -toward.y * orbitSign, y: toward.x * orbitSign };

  if (ship.tactic === 'flee') {
    delete ship.flightPass;
    const exit = arena.exitPoint;
    let direction = away;
    if (exit) direction = normalize(exit.x - ship.position.x, exit.y - ship.position.y);
    return { kind: 'escape', direction, speedFactor: 1 };
  }
  if (deliberateRam) {
    delete ship.flightPass;
    return { kind: 'ram', direction: toward, speedFactor: 1 };
  }
  const pursuing = pursuitManeuver(ship, enemy);
  if (pursuing) {
    delete ship.flightPass;
    return {
      kind: 'pursuit',
      direction: pursuing.direction,
      speedFactor: pursuing.speedFactor,
    };
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

  const ongoingPass = continueCommittedPass(ship, range, dx, dy, deltaSeconds);
  if (ongoingPass) return ongoingPass;

  // A ship inside its minimum useful firing envelope must not be ordered
  // towards the enemy by a separate forward-weapon alignment rule.
  if (range < Math.max(155, desiredRange * 0.62)) {
    return {
      kind: 'extend',
      direction: normalize(away.x + side.x * 0.4, away.y + side.y * 0.4),
      speedFactor: 0.88,
    };
  }

  const relativeX = ship.velocity.x - enemy.velocity.x;
  const relativeY = ship.velocity.y - enemy.velocity.y;
  const relativeClosing = relativeX * toward.x + relativeY * toward.y;
  const canPass =
    ship.subsystems.engine > 0 &&
    range <= desiredRange * 1.12 &&
    forwardPassReady(ship, enemy);
  if (canPass && relativeClosing > 14) {
    const shipSpeed = Math.max(65, ship.setup.combatSpeed ?? 120);
    const lead = Math.min(1.2, (range / shipSpeed) * 0.2);
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
    const rangeError = (range - desiredRange) / desiredRange;
    const radial = Math.max(-0.55, Math.min(0.55, rangeError));
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
