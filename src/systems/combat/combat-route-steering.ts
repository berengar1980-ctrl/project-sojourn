import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';
import { detectShipMine } from './mine-detection-service';
import { combatRouteHeading } from './combat-asteroid-routing';
import { asteroidCoverHeading } from './combat-asteroid-cover';
import { predictedCollisionEvasion, escapeContactDetour } from './combat-collision-evasion';
import { evaluateSteeringSafety } from './combat-steering-safety';
import type { CombatFlightIntent } from './combat-flight-intent';
import type {
  MutableCombatant,
  StrategicCombatArenaOptions,
  CombatPoint,
  StrategicCombatSide,
  MutableMine,
} from './strategic-combat-types';
import { clamp, distance, normalize } from './strategic-combat-geometry';
import { EDGE_WARNING_DISTANCE, EDGE_PADDING } from './strategic-combat-geometry';

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

function applyMineAvoidance(direction: CombatPoint, avoidance: CombatPoint | null): CombatPoint {
  if (!avoidance) return direction;
  return normalize(direction.x + avoidance.x * 2, direction.y + avoidance.y * 2);
}

function combatRouteDestination(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions,
  direction: CombatPoint,
  intentKind: CombatFlightIntent['kind'],
  ramDestination?: CombatPoint
): CombatPoint {
  if (ship.tactic === 'flee') return ship.escapeGate ?? arena.exitPoint ?? ship.position;
  // A fixed pass destination prevents ship-relative route orbiting.
  if (intentKind === 'pass') return ship.flightPass?.destination ?? enemy.position;
  if (intentKind === 'ram') return ramDestination ?? enemy.position;
  if (intentKind === 'intercept' || intentKind === 'pursuit') return enemy.position;

  return { x: ship.position.x + direction.x * 700, y: ship.position.y + direction.y * 700 };
}

export function steerCombatRoute(
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
    destination?: CombatPoint;
  }
): {
  direction: CombatPoint;
  targetSpeedFactor: number;
  clear: boolean;
  canAim: boolean;
} {
  let { direction, targetSpeedFactor } = posture;
  const mineAvoidance = avoidDetectedMine(combatant, side, activeMines, direction);
  // A fleeing ship has ONE persistent pursuer-clearance controller below.
  // Mixing generic collision evasion with its escape detour made the heading
  // jump between competing avoidance directions on consecutive frames.
  const evasion =
    deliberateRam || combatant.tactic === 'flee'
      ? null
      : predictedCollisionEvasion(combatant, enemy, side, toward, targetSpeedFactor);
  if (evasion) {
    direction = evasion.direction;
    targetSpeedFactor = evasion.speedFactor;
  }

  if (deliberateRam) {
    direction = posture.direction;
    targetSpeedFactor = 1;
    combatant.combatIntent = 'RAMMEN';
  }
  const cover = deliberateRam ? null : asteroidCoverHeading(combatant, enemy, arena);
  const destination = combatRouteDestination(
    combatant,
    enemy,
    arena,
    direction,
    posture.intentKind,
    posture.destination
  );
  const waypoint = combatRouteHeading(combatant, destination, arena, deltaSeconds);
  // A nearby solid rock takes priority over optional tactical cover.
  // In open space retain the original tactical cover behavior and gun passages.
  direction = applyMineAvoidance(
    obstacleAvoidance(combatant, arena) && waypoint
      ? waypoint
      : (cover ?? waypoint ?? direction),
    mineAvoidance
  );
  const obstacle = obstacleAvoidance(combatant, arena);
  // Never override a committed asteroid clearance waypoint with radial repulsion.
  if (obstacle && !waypoint) {
    direction = normalize(direction.x + obstacle.x * 2.4, direction.y + obstacle.y * 2.4);
  }
  if (waypoint && obstacle) {
    // Slow the approach before the collision shell: merely steering sideways
    // while carrying full forward inertia still rammed dense asteroid fields.
    targetSpeedFactor = Math.min(targetSpeedFactor, 0.8);
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
