import { isSecurityDrone } from '../../core/security-drone';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import { normalize, wrapAngle } from './strategic-combat-geometry';
import { weaponInArc } from './combat-weapon-geometry';
import { hasClearCombatShot } from './combat-line-of-sight';
import { mineBaitManeuver, pursuitManeuver } from './combat-tactical-maneuvers';
import { ramFlankTarget } from './combat-ram-targeting';

type TacticalKind = 'escape' | 'ram' | 'pursuit' | 'minefield';
type FlightKind = TacticalKind | 'intercept' | 'pass' | 'extend';

export interface CombatFlightIntent {
  readonly direction: CombatPoint;
  readonly speedFactor: number;
  readonly kind: FlightKind;
  readonly destination?: CombatPoint;
}

/** Do not turn back into the arena when the ship has reached its exit marker. */
function escapeGateDirection(
  ship: MutableCombatant,
  gate: CombatPoint,
  arena: StrategicCombatArenaOptions
): CombatPoint {
  const dx = gate.x - ship.position.x;
  const dy = gate.y - ship.position.y;
  if (Math.hypot(dx, dy) > 0.001) return normalize(dx, dy);
  const closest = Math.min(gate.x, arena.width - gate.x, gate.y, arena.height - gate.y);
  if (gate.x === closest) return { x: -1, y: 0 };
  if (arena.width - gate.x === closest) return { x: 1, y: 0 };
  return gate.y === closest ? { x: 0, y: -1 } : { x: 0, y: 1 };
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
  // Switching from shield breakers to hull batteries can change the required
  // broadside. An old committed lane must not keep steering the new gun away.
  if (
    pass.focus !== ship.strategy?.focus ||
    pass.broadsideFacing !== ship.strategy?.broadsideFacing
  ) {
    delete ship.flightPass;
    return null;
  }
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
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const error = Math.abs(wrapAngle(Math.atan2(dy, dx) - ship.headingRadians));
  if (!Number.isFinite(error) || error > 0.25) return false;

  for (let index = 0; index < ship.setup.weapons.length; index += 1) {
    const weapon = ship.setup.weapons[index]?.weapon;
    if (!weapon) continue;
    const mount = ship.setup.weaponMounts?.find((point) => point.slotIndex === index);
    const fixedGun = weapon.mount === 'forward' || weapon.family === 'railgun';
    const frontMount = !mount?.facing || mount.facing === 'forward';
    if (!fixedGun || !frontMount) continue;
    if (!weaponInArc(ship, enemy.position, index, weapon)) return false;
  }
  return true;
}

/** Check whether any mounted weapon can currently fire along an unblocked corridor. */
function clearFiringLane(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  arena: StrategicCombatArenaOptions
): boolean {
  if (!arena.obstacles?.length) return true;
  return ship.setup.weapons.some(
    (component, index) =>
      component.weapon &&
      range <= component.weapon.rangeMeters &&
      hasClearCombatShot(ship, enemy, index, arena)
  );
}

/**
 * A broadside passage may only start after its CHOSEN side can fire.
 * A ready turret on the opposite arc is not evidence that a side gun
 * is aligned. The heading is prepared by the regular posture controller.
 */
function preferredBroadsideAligned(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  arena: StrategicCombatArenaOptions
): boolean {
  if (ship.strategy?.focus !== 'broadside') return true;
  const facing = ship.strategy.broadsideFacing;
  return ship.setup.weapons.some((component, index) => {
    const weapon = component.weapon;
    const mount = ship.setup.weaponMounts?.find((point) => point.slotIndex === index);
    return (
      weapon?.mount === 'broadside' &&
      mount?.facing === facing &&
      range <= weapon.rangeMeters &&
      weaponInArc(ship, enemy.position, index, weapon) &&
      (!arena.obstacles?.length || hasClearCombatShot(ship, enemy, index, arena))
    );
  });
}

function readyForAttackPass(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  desiredRange: number,
  toward: CombatPoint,
  firingLane: boolean,
  arena: StrategicCombatArenaOptions
): boolean {
  // The second AI planner starts four seconds later; unplanned ships may
  // approach but cannot lock in an unarmed twenty-second attack passage.
  if (!ship.strategy || !firingLane || ship.subsystems.engine <= 0) return false;
  // Forward guns may commit from their wider true firing envelope. Waiting
  // for the closer optimal range stalled passes after conserving opening boost.
  const passRangeFactor = ship.strategy.focus === 'forward' ? 1.35 : 1.12;
  if (range > desiredRange * passRangeFactor) return false;
  if (!preferredBroadsideAligned(ship, enemy, range, arena)) return false;
  const relativeX = ship.velocity.x - enemy.velocity.x;
  const relativeY = ship.velocity.y - enemy.velocity.y;
  const closing = relativeX * toward.x + relativeY * toward.y;
  // A front-gun ship with a clear aligned shot may start a passage from rest
  // rather than wait forever for speed it cannot build while orbiting.
  const momentumReady = ship.strategy.focus === 'forward' || closing > 14;
  return momentumReady && forwardPassReady(ship, enemy);
}

/** Fix a destination beyond the enemy so asteroid routing can complete the passage. */
function beginAttackPass(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  range: number,
  side: CombatPoint
): CombatFlightIntent {
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const shipSpeed = Math.max(65, ship.setup.combatSpeed ?? 120);
  const lead = Math.min(1.2, (range / shipSpeed) * 0.2);
  const broadside = ship.strategy?.focus === 'broadside';
  // Once a side gun is aimed, fly tangentially instead of cutting across the
  // opponent. Opposite port/starboard plans independently yield parallel tracks.
  // The small radial correction preserves useful firing range without an orbit.
  const toward = normalize(dx, dy);
  const rangeError = (range - (ship.strategy?.desiredRange ?? range)) / Math.max(1, range);
  const radial = Math.max(-0.18, Math.min(0.18, rangeError));
  const direction = broadside
    ? normalize(side.x + toward.x * radial, side.y + toward.y * radial)
    : normalize(
        dx + enemy.velocity.x * lead + side.x * Math.min(250, range * 0.36),
        dy + enemy.velocity.y * lead + side.y * Math.min(250, range * 0.36)
      );
  const overshoot = Math.min(700, Math.max(350, range * 0.7));
  const waypointOrigin = broadside ? ship.position : enemy.position;
  ship.flightPass = {
    direction,
    ...(ship.strategy ? { focus: ship.strategy.focus } : {}),
    ...(ship.strategy?.broadsideFacing ? { broadsideFacing: ship.strategy.broadsideFacing } : {}),
    destination: {
      x: Math.max(160, Math.min(arena.width - 160, waypointOrigin.x + direction.x * overshoot)),
      y: Math.max(160, Math.min(arena.height - 160, waypointOrigin.y + direction.y * overshoot)),
    },
    startRange: range,
    closestRange: range,
    ageSeconds: 0,
  };
  return { kind: 'pass', direction, speedFactor: 0.92 };
}

function droneNeedsClearShot(ship: MutableCombatant, range: number, firingLane: boolean): boolean {
  return (
    !firingLane &&
    isSecurityDrone(ship.setup.id) &&
    ship.setup.weapons.some((weapon) => (weapon.weapon?.rangeMeters ?? 0) >= range)
  );
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

  // An orbit is useful only when a mounted gun has a clear firing lane.
  const firingLane = clearFiringLane(ship, enemy, range, arena);

  if (ship.tactic === 'flee') {
    delete ship.flightPass;
    const exit = ship.escapeGate ?? arena.exitPoint;
    let direction = away;
    if (exit) direction = escapeGateDirection(ship, exit, arena);
    return { kind: 'escape', direction, speedFactor: 1 };
  }
  if (deliberateRam) {
    delete ship.flightPass;
    const destination = ramFlankTarget(ship, enemy);
    return {
      kind: 'ram',
      destination,
      direction: normalize(destination.x - ship.position.x, destination.y - ship.position.y),
      speedFactor: 1,
    };
  }
  if (droneNeedsClearShot(ship, range, firingLane)) {
    delete ship.flightPass;
    return {
      kind: 'intercept',
      direction: normalize(side.x + toward.x * 0.2, side.y + toward.y * 0.2),
      speedFactor: 0.75,
    };
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

  if (readyForAttackPass(ship, enemy, range, desiredRange, toward, firingLane, arena)) {
    return beginAttackPass(ship, enemy, arena, range, side);
  }

  if (range < desiredRange * 1.2 && firingLane && ship.strategy?.focus !== 'forward') {
    // Orbit only with a viable firing lane and a non-frontal weapon posture.
    // Fixed bow guns must first build a real closing pass, not circle at range.
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
