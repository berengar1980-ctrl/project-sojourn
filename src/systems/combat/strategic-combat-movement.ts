import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';

import { detectShipMine } from './mine-detection-service';
import { resolveCombatAsteroidContacts } from './combat-asteroid-contacts';
import { combatRouteHeading } from './combat-asteroid-routing';
import { asteroidCoverHeading } from './combat-asteroid-cover';
import { usefulRamAttempt } from './combat-ram-opportunity';
import { chooseCombatFlightIntent, type CombatFlightIntent } from './combat-flight-intent';
import { updateStandardCombatBoost } from './combat-standard-boost';
import { applyInertialThrust } from './combat-inertial-thrust';
import { predictedCollisionEvasion, escapeContactDetour } from './combat-collision-evasion';
import { evaluateSteeringSafety } from './combat-steering-safety';
import { preferredRange } from './combat-tactic-choice';
export { updateAiTactic } from './combat-tactic-choice';

import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  CombatPoint,
  StrategicCombatSide,
  MutableMine,
} from './strategic-combat-types';

import {
  clamp,
  distance,
  EDGE_WARNING_DISTANCE,
  EDGE_PADDING,
  normalize,
  wrapAngle,
  DEFAULT_TURN_RATE,
  DEFAULT_ACCELERATION,
} from './strategic-combat-geometry';

function arenaBoundaryAvoidance(
  combatant: MutableCombatant,
  arena: StrategicCombatArenaOptions
): { readonly x: number; readonly y: number; readonly strength: number } | null {
  const warning = Math.max(
    120,
    Math.min(EDGE_WARNING_DISTANCE, arena.width * 0.22, arena.height * 0.22)
  );
  const left = combatant.position.x - EDGE_PADDING;
  const right = arena.width - EDGE_PADDING - combatant.position.x;
  const top = combatant.position.y - EDGE_PADDING;
  const bottom = arena.height - EDGE_PADDING - combatant.position.y;
  let x = 0;
  let y = 0;
  let strongest = 0;

  const push = (distanceToEdge: number, dx: number, dy: number): void => {
    if (distanceToEdge >= warning) return;
    const raw = clamp((warning - Math.max(0, distanceToEdge)) / warning, 0, 1);
    const strength = raw * raw;
    x += dx * strength;
    y += dy * strength;
    strongest = Math.max(strongest, strength);
  };

  push(left, 1, 0);
  push(right, -1, 0);
  push(top, 0, 1);
  push(bottom, 0, -1);
  if (strongest <= 0) return null;
  const direction = normalize(x, y);
  return { x: direction.x, y: direction.y, strength: strongest };
}

function obstacleAvoidance(
  combatant: MutableCombatant,
  arena: StrategicCombatArenaOptions
): CombatPoint | null {
  let x = 0;
  let y = 0;
  let weight = 0;
  for (const obstacle of arena.obstacles ?? []) {
    const dx = combatant.position.x - obstacle.position.x;
    const dy = combatant.position.y - obstacle.position.y;
    const range = Math.hypot(dx, dy);
    const safe = obstacle.radius + 150;
    if (range >= safe) continue;
    const direction = normalize(dx, dy);
    const strength = clamp((safe - range) / safe, 0, 1);
    x += direction.x * strength;
    y += direction.y * strength;
    weight += strength;
  }
  return weight > 0 ? normalize(x, y) : null;
}

export function resolveArenaObstacles(
  combatant: MutableCombatant,
  arena: StrategicCombatArenaOptions
): void {
  resolveCombatAsteroidContacts(combatant, arena);
}

export { resolveCombatantCollision } from './combat-contact-response';

export function mineDetection(
  mine: ShipMineDefinition,
  viewer: MutableCombatant,
  minePosition: CombatPoint
): MineContactLevel {
  return detectShipMine(mine, {
    crewSkill: viewer.setup.sensorCrewSkill ?? 0,
    sensorTier: viewer.setup.sensorTier ?? 0,
    sensorRangeMeters: viewer.setup.sensorRangeMeters ?? 0,
    sensorRangeMultiplier: viewer.setup.sensorRangeMultiplier ?? 1,
    distanceMeters: distance(viewer.position, minePosition),
  }).level;
}

/** Avoid detectable mines using the current drift and planned heading. */
export function avoidDetectedMine(
  combatant: MutableCombatant,
  side: StrategicCombatSide,
  mines: readonly MutableMine[],
  desired: CombatPoint
): CombatPoint | null {
  const heading = normalize(
    combatant.velocity.x + desired.x * 65,
    combatant.velocity.y + desired.y * 65
  );
  const threat = mines
    .filter((mine) => mine.owner !== side)
    .filter((mine) => mineDetection(mine.definition, combatant, mine.position) !== 'hidden')
    .map((mine) => {
      const dx = mine.position.x - combatant.position.x;
      const dy = mine.position.y - combatant.position.y;
      const along = dx * heading.x + dy * heading.y;
      const lateral = dx * -heading.y + dy * heading.x;
      const safe = mine.definition.triggerRadiusMeters + 75;
      return { mine, along, lateral, safe };
    })
    .filter(
      (entry) => entry.along >= -40 && entry.along < 380 && Math.abs(entry.lateral) < entry.safe
    )
    .sort((a, b) => a.along - b.along)[0];
  if (!threat) return null;
  const evadeSide = threat.lateral >= 0 ? -1 : 1;
  return normalize(
    heading.x * 0.45 - heading.y * evadeSide,
    heading.y * 0.45 + heading.x * evadeSide
  );
}

function isTractorLocked(combatant: MutableCombatant, enemy: MutableCombatant): boolean {
  return (
    combatant.shieldHp <= 0 &&
    enemy.hullHp > 0 &&
    enemy.subsystems.tractor > 0 &&
    distance(combatant.position, enemy.position) <= (enemy.setup.tractorRangeMeters ?? 0)
  );
}

/** Apply limited thrust to velocity; turning the bow does not rotate existing momentum. */
/**
 * Heavy side guns dictate the preferred heading, while the main movement
 * routine remains responsible for thrust, inertia and obstacle avoidance.
 */
function broadsideSteering(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  dx: number,
  dy: number
): CombatPoint | null {
  if (combatant.tactic === 'flee') return null;
  if (combatant.strategy && combatant.strategy.focus !== 'broadside') return null;
  const sideGun = combatant.setup.weapons
    .map((weapon, index) => ({ weapon, index }))
    .filter(
      (entry) =>
        entry.weapon.weapon?.mount === 'broadside' &&
        range <= entry.weapon.weapon.rangeMeters * 1.2 &&
        (!combatant.strategy?.broadsideFacing ||
          combatant.setup.weaponMounts?.find((mount) => mount.slotIndex === entry.index)?.facing ===
            combatant.strategy.broadsideFacing)
    )
    .sort((a, b) =>
      enemy.shieldHp > 0
        ? (b.weapon.weapon?.shieldDamage ?? 0) - (a.weapon.weapon?.shieldDamage ?? 0)
        : (b.weapon.weapon?.hullDamage ?? 0) - (a.weapon.weapon?.hullDamage ?? 0)
    )[0];
  if (!sideGun) return null;
  const facing = combatant.setup.weaponMounts?.find(
    (mount) => mount.slotIndex === sideGun.index
  )?.facing;
  const heading =
    Math.atan2(dy, dx) +
    (facing === 'starboard' ? -Math.PI / 2 : facing === 'port' ? Math.PI / 2 : 0);
  return { x: Math.cos(heading), y: Math.sin(heading) };
}

/**
 * Fixed forward guns can track the enemy while the ship still travels along
 * its independently chosen pass. Using RCS for that separation preserves inertia.
 */
function forwardWeaponSteering(
  combatant: MutableCombatant,
  range: number,
  toward: CombatPoint
): CombatPoint | null {
  if (combatant.tactic === 'flee' || combatant.strategy?.focus !== 'forward') return null;
  const forwardRange = Math.max(
    0,
    ...combatant.setup.weapons.flatMap((component, index) => {
      if (component.weapon?.mount !== 'forward') return [];
      const mount = combatant.setup.weaponMounts?.find((entry) => entry.slotIndex === index);
      if (mount?.facing && mount.facing !== 'forward') return [];
      return [component.weapon.rangeMeters];
    })
  );
  // Even while opening distance, loaded fixed guns should still track a
  // target safely outside collision contact. Translation uses independent RCS.
  if (forwardRange <= 0 || range < 155) return null;
  return toward;
}

function performCombatThrust(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  deltaSeconds: number,
  arena: StrategicCombatArenaOptions,
  headingDirection: CombatPoint,
  targetSpeedFactor: number,
  strafeDirection?: CombatPoint
): void {
  const desiredHeading = Math.atan2(headingDirection.y, headingDirection.x);
  const headingError = wrapAngle(desiredHeading - combatant.headingRadians);
  const maxTurn = Math.max(0.25, combatant.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const turn = clamp(headingError, -maxTurn * deltaSeconds, maxTurn * deltaSeconds);
  combatant.headingRadians = wrapAngle(combatant.headingRadians + turn);
  combatant.turnRateRadiansPerSecond = deltaSeconds > 0 ? turn / deltaSeconds : 0;
  combatant.angularThrust = clamp(headingError / Math.max(0.1, maxTurn), -1, 1);

  const baseSpeed = Math.max(65, combatant.setup.combatSpeed ?? 120);
  const acceleration = Math.max(
    12,
    combatant.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  if (combatant.subsystems.engine <= 0) {
    // With no main engine the ship keeps drifting; only RCS can turn its bow.
    combatant.position.x = clamp(
      combatant.position.x + combatant.velocity.x * deltaSeconds,
      EDGE_PADDING,
      arena.width - EDGE_PADDING
    );
    combatant.position.y = clamp(
      combatant.position.y + combatant.velocity.y * deltaSeconds,
      EDGE_PADDING,
      arena.height - EDGE_PADDING
    );
    resolveArenaObstacles(combatant, arena);
    return;
  }
  applyInertialThrust(
    combatant,
    headingError,
    targetSpeedFactor,
    baseSpeed,
    acceleration,
    isTractorLocked(combatant, enemy),
    deltaSeconds,
    arena,
    strafeDirection
  );
  resolveArenaObstacles(combatant, arena);
}

function applyMineAvoidance(direction: CombatPoint, avoidance: CombatPoint | null): CombatPoint {
  if (!avoidance) return direction;
  return normalize(direction.x + avoidance.x * 2, direction.y + avoidance.y * 2);
}

function combatRouteDestination(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  direction: CombatPoint,
  intentKind: CombatFlightIntent['kind']
): CombatPoint {
  if (ship.tactic === 'flee') return ship.escapeGate ?? arena.exitPoint ?? ship.position;
  // An orbital steering vector is not a destination. Path toward the actual
  // opponent while intercepting, so repeated detours converge in dense fields.
  if (intentKind === 'intercept' || intentKind === 'pursuit' || intentKind === 'ram') {
    return enemy.position;
  }
  // Flybys, minelaying and spacing manoeuvres keep their own travel direction.
  return { x: ship.position.x + direction.x * 700, y: ship.position.y + direction.y * 700 };
}

function steerCombatRoute(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  deltaSeconds: number,
  arena: StrategicCombatArenaOptions,
  activeMines: readonly MutableMine[],
  toward: CombatPoint,
  deliberateRam: boolean,
  posture: {
    direction: CombatPoint;
    targetSpeedFactor: number;
    intentKind: CombatFlightIntent['kind'];
  }
): {
  direction: CombatPoint;
  targetSpeedFactor: number;
  clear: boolean;
  canAim: boolean;
} {
  let { direction, targetSpeedFactor } = posture;
  const mineAvoidance = avoidDetectedMine(combatant, side, activeMines, direction);
  const evasion = deliberateRam
    ? null
    : predictedCollisionEvasion(combatant, enemy, side, toward, targetSpeedFactor);
  if (evasion) {
    // An emergency dodge must not replace a commanded escape with an orbit.
    direction =
      combatant.tactic === 'flee'
        ? normalize(direction.x * 2 + evasion.direction.x, direction.y * 2 + evasion.direction.y)
        : evasion.direction;
    targetSpeedFactor = evasion.speedFactor;
  }

  if (deliberateRam) {
    direction = toward;
    targetSpeedFactor = 1;
    combatant.combatIntent = 'RAMMEN';
  }
  const cover = deliberateRam ? null : asteroidCoverHeading(combatant, enemy, arena);
  const destination = combatRouteDestination(
    combatant,
    enemy,
    arena,
    direction,
    posture.intentKind
  );
  const waypoint = combatRouteHeading(combatant, destination, arena, deltaSeconds);
  direction = applyMineAvoidance(cover ?? waypoint ?? direction, mineAvoidance);
  const obstacle = obstacleAvoidance(combatant, arena);
  // Follow the chosen flank; radial repulsion against the same rock used to
  // overpower the waypoint and flip the bow left/right on consecutive ticks.
  if (obstacle && (combatant.tactic !== 'flee' || !waypoint)) {
    direction = normalize(direction.x + obstacle.x * 2.4, direction.y + obstacle.y * 2.4);
  }

  // Close contact with a blocking ship needs a committed *sideways* pass,
  // not another forward push into the collision shell.
  const detour =
    combatant.tactic === 'flee' ? escapeContactDetour(combatant, enemy, side, direction) : null;
  if (detour) {
    direction = detour;
    targetSpeedFactor = Math.max(0.85, targetSpeedFactor);
  }

  const boundary = arenaBoundaryAvoidance(combatant, arena);
  if (boundary && combatant.tactic !== 'flee') {
    const steeringWeight = 1.8 + boundary.strength * 4.2;
    direction = normalize(
      direction.x + boundary.x * steeringWeight,
      direction.y + boundary.y * steeringWeight
    );
    targetSpeedFactor = Math.min(
      targetSpeedFactor,
      Math.max(0.38, 0.76 - boundary.strength * 0.34)
    );
  }

  const safety = evaluateSteeringSafety(combatant, {
    mines: Boolean(mineAvoidance),
    obstacle: Boolean(obstacle),
    boundary: Boolean(boundary),
    waypoint: Boolean(waypoint),
    cover: Boolean(cover),
    collision: Boolean(evasion),
    detour: Boolean(detour),
  });
  return { direction, targetSpeedFactor, ...safety };
}

interface WeaponPostureInput {
  readonly combatant: MutableCombatant;
  readonly enemy: MutableCombatant;
  readonly range: number;
  readonly desired: number;
  readonly toward: CombatPoint;
  readonly travel: CombatPoint;
  readonly canAim: boolean;
  readonly deliberateRam: boolean;
}

/** One owner chooses the bow orientation without replacing the travel vector. */
function chooseWeaponPosture(input: WeaponPostureInput): {
  readonly heading: CombatPoint;
  readonly strafe?: CombatPoint;
} {
  const { combatant, enemy, range, desired, toward, travel } = input;
  if (!input.canAim || input.deliberateRam) return { heading: travel };

  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const broadside = broadsideSteering(combatant, enemy, range, dx, dy);
  const broadsideReady =
    broadside &&
    combatant.strategy?.phase !== 'reach_range' &&
    range >= Math.max(155, desired * 0.66);
  if (broadsideReady) return { heading: broadside, strafe: travel };

  // A committed flyby is a trajectory, not a forced bow orientation. RCS
  // keeps loaded forward weapons on the target while the ship traverses its pass.
  const forward = forwardWeaponSteering(combatant, range, toward);
  return forward ? { heading: forward, strafe: travel } : { heading: travel };
}

export function moveCombatant(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  deltaSeconds: number,
  arena: StrategicCombatArenaOptions,
  activeMines: readonly MutableMine[]
): void {
  if (combatant.hullHp <= 0) {
    combatant.velocity.x = 0;
    combatant.velocity.y = 0;
    combatant.speed = 0;
    combatant.turnRateRadiansPerSecond = 0;
    combatant.angularThrust = 0;
    return;
  }

  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const range = Math.max(1, Math.hypot(dx, dy));
  const toward = normalize(dx, dy);
  const desired = combatant.strategy?.desiredRange ?? preferredRange(combatant);
  const deliberateRam = usefulRamAttempt(combatant, enemy);
  const intent = chooseCombatFlightIntent(
    combatant,
    enemy,
    desired,
    arena,
    deltaSeconds,
    deliberateRam
  );
  let { direction } = intent;
  let targetSpeedFactor = intent.speedFactor;
  if (intent.kind === 'pass') combatant.combatIntent = 'ANGRIFFSPASSAGE';
  if (intent.kind === 'extend') combatant.combatIntent = 'ABSTAND GEWINNEN';

  const steering = steerCombatRoute(
    combatant,
    enemy,
    side,
    deltaSeconds,
    arena,
    activeMines,
    toward,
    deliberateRam,
    { direction, targetSpeedFactor, intentKind: intent.kind }
  );
  direction = steering.direction;
  targetSpeedFactor = steering.targetSpeedFactor;

  const posture = chooseWeaponPosture({
    combatant,
    enemy,
    range,
    desired,
    toward,
    travel: direction,
    canAim: steering.canAim,
    deliberateRam,
  });
  const headingDirection = posture.heading;
  // The bow may need time to turn, but RCS can already correct the escape
  // velocity. Without this the main engine traces a broad circle first.
  const headingError = wrapAngle(Math.atan2(direction.y, direction.x) - combatant.headingRadians);
  const escapeStrafe = combatant.tactic === 'flee' && Math.abs(headingError) > 0.65;
  updateStandardCombatBoost(
    combatant,
    headingDirection,
    range,
    desired,
    targetSpeedFactor,
    deliberateRam,
    steering.clear,
    deltaSeconds
  );
  performCombatThrust(
    combatant,
    enemy,
    deltaSeconds,
    arena,
    headingDirection,
    targetSpeedFactor,
    escapeStrafe ? direction : posture.strafe
  );
}
