import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';

import { detectShipMine } from './mine-detection-service';
import { resolveCombatAsteroidContacts } from './combat-asteroid-contacts';
import { combatRouteHeading } from './combat-asteroid-routing';
import { asteroidCoverHeading } from './combat-asteroid-cover';
import { usefulRamAttempt } from './combat-ram-opportunity';
import { chooseCombatFlightIntent } from './combat-flight-intent';
import { updateStandardCombatBoost } from './combat-standard-boost';
import { applyInertialThrust } from './combat-inertial-thrust';
import { predictedCollisionEvasion } from './combat-collision-evasion';
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

export function resolveCombatantCollision(first: MutableCombatant, second: MutableCombatant): void {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const range = Math.hypot(dx, dy);
  const required = 86;
  if (range >= required) return;
  const normal = range > 0.001 ? { x: dx / range, y: dy / range } : { x: 1, y: 0 };
  const overlap = required - range + 1;
  first.position.x -= normal.x * overlap * 0.5;
  first.position.y -= normal.y * overlap * 0.5;
  second.position.x += normal.x * overlap * 0.5;
  second.position.y += normal.y * overlap * 0.5;
  first.velocity.x *= 0.6;
  first.velocity.y *= 0.6;
  second.velocity.x *= 0.6;
  second.velocity.y *= 0.6;
  first.speed = Math.hypot(first.velocity.x, first.velocity.y);
  second.speed = Math.hypot(second.velocity.x, second.velocity.y);
}

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

/** Pick a lateral escape corridor from a detected mine, not a radial reversal.
 * Prediction uses closest approach along current drift and the planned heading.
 */
export function avoidDetectedMine(
  combatant: MutableCombatant,
  side: StrategicCombatSide,
  mines: readonly MutableMine[],
  desired: CombatPoint
): CombatPoint | null {
  if (!combatant.setup.aiControlled) return null;
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
  desired: number,
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
  if (range > forwardRange || range < Math.max(240, desired * 0.5)) return null;
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

function steerCombatRoute(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  deltaSeconds: number,
  arena: StrategicCombatArenaOptions,
  activeMines: readonly MutableMine[],
  toward: CombatPoint,
  deliberateRam: boolean,
  posture: { direction: CombatPoint; targetSpeedFactor: number }
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
    direction = evasion.direction;
    targetSpeedFactor = evasion.speedFactor;
  }

  if (deliberateRam) {
    direction = toward;
    targetSpeedFactor = 1;
    combatant.combatIntent = 'RAMMEN';
  }
  const cover = deliberateRam ? null : asteroidCoverHeading(combatant, enemy, arena);
  const destination = {
    x: combatant.position.x + direction.x * 700,
    y: combatant.position.y + direction.y * 700,
  };
  const waypoint = combatRouteHeading(combatant, destination, arena, deltaSeconds);
  direction = applyMineAvoidance(cover ?? waypoint ?? direction, mineAvoidance);
  const obstacle = obstacleAvoidance(combatant, arena);
  if (obstacle) {
    direction = normalize(direction.x + obstacle.x * 2.4, direction.y + obstacle.y * 2.4);
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

  return {
    direction,
    targetSpeedFactor,
    clear: !mineAvoidance && !obstacle && !boundary && !waypoint && !cover,
    canAim: !mineAvoidance && !obstacle && !boundary && !evasion,
  };
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
    { direction, targetSpeedFactor }
  );
  direction = steering.direction;
  targetSpeedFactor = steering.targetSpeedFactor;

  // Aim the broadside independently of translation. Steering the engines along
  // the broadside heading made both ships orbit indefinitely without firing.
  const gunHeading =
    !deliberateRam && steering.canAim ? broadsideSteering(combatant, enemy, range, dx, dy) : null;
  const broadsideActive =
    Boolean(gunHeading) &&
    combatant.strategy?.phase !== 'reach_range' &&
    range >= Math.max(155, desired * 0.66);
  // Track fixed guns while engaging; a committed pass or separation needs
  // full propulsion authority rather than prolonged sideways RCS steering.
  const engaging =
    intent.kind === 'intercept' && range >= desired * 0.74 && range <= desired * 1.12;
  const forwardHeading =
    engaging && !deliberateRam && steering.canAim
      ? forwardWeaponSteering(combatant, range, desired, toward)
      : null;
  const trackingWeapons = broadsideActive || Boolean(forwardHeading);
  const headingDirection = broadsideActive ? gunHeading! : (forwardHeading ?? direction);
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
    trackingWeapons ? direction : undefined
  );
}
