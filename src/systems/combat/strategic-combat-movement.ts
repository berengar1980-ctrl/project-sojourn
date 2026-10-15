import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';

import { detectShipMine } from './mine-detection-service';
import { resolveCombatAsteroidContacts } from './combat-asteroid-contacts';
import { combatRouteHeading } from './combat-asteroid-routing';
import { asteroidCoverHeading } from './combat-asteroid-cover';
import { createCombatFlightOrder } from './combat-flight-order';
import { pilotCombatFlight } from './combat-flight-controller';
import { usefulRamAttempt } from './combat-ram-opportunity';
import { updateStandardCombatBoost } from './combat-standard-boost';
import { predictedCollisionEvasion } from './combat-collision-evasion';

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
  // Routing to the enemy overrides flight direction even when the pilot is
  // trying to reach the gate. Fleeing ships must route to the gate instead.
  const escaping = combatant.tactic === 'flee';
  const cover =
    escaping || deliberateRam || evasion ? null : asteroidCoverHeading(combatant, enemy, arena);
  direction = cover ?? direction;
  const routeTarget =
    escaping && arena.exitPoint
      ? arena.exitPoint
      : {
          x: combatant.position.x + direction.x * 400,
          y: combatant.position.y + direction.y * 400,
        };
  const waypoint = combatRouteHeading(combatant, routeTarget, arena, deltaSeconds);
  direction = waypoint ?? direction;
  const mineAvoidance = avoidDetectedMine(combatant, side, activeMines, direction);
  direction = applyMineAvoidance(direction, mineAvoidance);
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

  // Safety is a translation request, even when range control requested a halt.
  // Otherwise a ship at its firing distance only rotates beside the hazard.
  const avoiding = [mineAvoidance, obstacle, boundary, waypoint, cover].some(Boolean);
  if (avoiding) targetSpeedFactor = Math.max(0.38, targetSpeedFactor);
  return {
    direction,
    targetSpeedFactor,
    clear: !avoiding,
    canAim: ![mineAvoidance, obstacle, boundary, waypoint, evasion].some(Boolean),
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

  const order = createCombatFlightOrder(combatant, enemy, arena);
  const toward = normalize(
    enemy.position.x - combatant.position.x,
    enemy.position.y - combatant.position.y
  );
  const deliberateRam = usefulRamAttempt(combatant, enemy);
  const speed = Math.max(65, combatant.setup.combatSpeed ?? 120);
  const requestedSpeed = Math.hypot(order.velocity.x, order.velocity.y);
  const direction = requestedSpeed > 0.001 ? normalize(order.velocity.x, order.velocity.y) : toward;
  const steering = steerCombatRoute(
    combatant,
    enemy,
    side,
    deltaSeconds,
    arena,
    activeMines,
    toward,
    deliberateRam,
    { direction, targetSpeedFactor: requestedSpeed / speed }
  );
  const safetyActive = !steering.canAim || deliberateRam;
  const heading = safetyActive
    ? Math.atan2(steering.direction.y, steering.direction.x)
    : order.heading;
  updateStandardCombatBoost(
    combatant,
    steering.direction,
    distance(combatant.position, enemy.position),
    combatant.strategy?.desiredRange ?? 300,
    steering.targetSpeedFactor,
    deliberateRam,
    steering.clear,
    deltaSeconds
  );
  const multiplier = combatant.boostActive ? 1.65 : 1;
  const velocity = {
    x: steering.direction.x * speed * steering.targetSpeedFactor * multiplier,
    y: steering.direction.y * speed * steering.targetSpeedFactor * multiplier,
  };
  pilotCombatFlight(
    combatant,
    { velocity, heading },
    arena,
    deltaSeconds,
    isTractorLocked(combatant, enemy)
  );
  resolveArenaObstacles(combatant, arena);
}
