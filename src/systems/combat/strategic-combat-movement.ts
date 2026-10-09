import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';

import { detectShipMine } from './mine-detection-service';

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

function preferredRange(combatant: MutableCombatant): number {
  const ranges = combatant.setup.weapons.flatMap((weapon) =>
    weapon.weapon ? [weapon.weapon.rangeMeters] : []
  );
  if (ranges.length === 0) return 300;
  const max = Math.max(...ranges);
  const min = Math.min(...ranges);
  if (combatant.tactic === 'kite') return Math.max(520, max * 0.84);
  if (combatant.tactic === 'minefield') return Math.max(430, min * 0.78);
  return Math.max(340, min * 0.72);
}

export function updateAiTactic(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  elapsedSeconds: number
): void {
  if (!combatant.setup.aiControlled || combatant.hullHp <= 0) return;
  const hullRatio = combatant.hullHp / Math.max(1, combatant.hullMaxHp);
  const shieldRatio =
    combatant.shieldMaxHp <= 0 ? 0 : combatant.shieldHp / Math.max(1, combatant.shieldMaxHp);
  const aggression = clamp(combatant.setup.aiAggression ?? 50, 0, 100);
  const range = distance(combatant.position, enemy.position);

  if (hullRatio <= 0.3 && aggression < 88) {
    combatant.tactic = 'flee';
    return;
  }
  if (
    combatant.mineStock.length > 0 &&
    elapsedSeconds >= 5 &&
    range <= 700 &&
    aggression >= 58 &&
    Math.floor(elapsedSeconds / 10) % 2 === 0
  ) {
    combatant.tactic = 'minefield';
    return;
  }
  if (shieldRatio <= 0.25 && hullRatio > 0.45 && aggression < 78) {
    combatant.tactic = 'kite';
    return;
  }
  combatant.tactic = combatant.setup.preferredTactic ?? 'fight';
}

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
  const shipRadius = 48;
  for (const obstacle of arena.obstacles ?? []) {
    const dx = combatant.position.x - obstacle.position.x;
    const dy = combatant.position.y - obstacle.position.y;
    const range = Math.hypot(dx, dy);
    const required = Math.max(0, obstacle.radius) + shipRadius;
    if (range >= required) continue;
    const normal = range > 0.001 ? { x: dx / range, y: dy / range } : { x: 1, y: 0 };
    combatant.position.x = obstacle.position.x + normal.x * required;
    combatant.position.y = obstacle.position.y + normal.y * required;
    combatant.speed *= 0.35;
  }
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
  first.speed *= 0.6;
  second.speed *= 0.6;
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

function avoidDetectedMine(
  combatant: MutableCombatant,
  side: StrategicCombatSide,
  mines: readonly MutableMine[]
): CombatPoint | null {
  if (!combatant.setup.aiControlled) return null;
  const threat = mines
    .filter((mine) => mine.owner !== side)
    .map((mine) => ({
      mine,
      level: mineDetection(mine.definition, combatant, mine.position),
      range: distance(combatant.position, mine.position),
    }))
    .filter(
      (entry) =>
        entry.level !== 'hidden' && entry.range <= entry.mine.definition.triggerRadiusMeters * 2.4
    )
    .sort((a, b) => a.range - b.range)[0];
  if (!threat) return null;
  return normalize(
    combatant.position.x - threat.mine.position.x,
    combatant.position.y - threat.mine.position.y
  );
}

function isTractorLocked(combatant: MutableCombatant, enemy: MutableCombatant): boolean {
  return (
    combatant.shieldHp <= 0 &&
    enemy.hullHp > 0 &&
    distance(combatant.position, enemy.position) <= (enemy.setup.tractorRangeMeters ?? 0)
  );
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
    combatant.speed = 0;
    combatant.turnRateRadiansPerSecond = 0;
    combatant.angularThrust = 0;
    return;
  }

  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const range = Math.max(1, Math.hypot(dx, dy));
  const toward = normalize(dx, dy);
  const perpendicular =
    side === 'attacker' ? { x: -toward.y, y: toward.x } : { x: toward.y, y: -toward.x };
  const desired = preferredRange(combatant);

  let direction = toward;
  let targetSpeedFactor = 0.88;
  if (combatant.tactic === 'flee') {
    direction = { x: -toward.x, y: -toward.y };
    targetSpeedFactor = 1;
  } else if (range < desired * 0.72) {
    direction = normalize(
      -toward.x * 0.8 + perpendicular.x * 0.45,
      -toward.y * 0.8 + perpendicular.y * 0.45
    );
    targetSpeedFactor = 0.72;
  } else if (range <= desired * 1.18) {
    direction = normalize(perpendicular.x + toward.x * 0.18, perpendicular.y + toward.y * 0.18);
    targetSpeedFactor = combatant.tactic === 'kite' ? 0.78 : 0.62;
  } else if (combatant.tactic === 'kite' && range < desired * 1.5) {
    direction = normalize(-toward.x * 0.45 + perpendicular.x, -toward.y * 0.45 + perpendicular.y);
    targetSpeedFactor = 0.8;
  }

  const mineAvoidance = avoidDetectedMine(combatant, side, activeMines);
  if (mineAvoidance) {
    direction = normalize(direction.x + mineAvoidance.x * 2, direction.y + mineAvoidance.y * 2);
  }
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

  const desiredHeading = Math.atan2(direction.y, direction.x);
  const headingError = wrapAngle(desiredHeading - combatant.headingRadians);
  const maxTurn = Math.max(0.25, combatant.setup.turnRateRadiansPerSecond ?? DEFAULT_TURN_RATE);
  const turn = clamp(headingError, -maxTurn * deltaSeconds, maxTurn * deltaSeconds);
  combatant.headingRadians = wrapAngle(combatant.headingRadians + turn);
  combatant.turnRateRadiansPerSecond = deltaSeconds > 0 ? turn / deltaSeconds : 0;
  combatant.angularThrust = clamp(headingError / Math.max(0.1, maxTurn), -1, 1);

  const baseSpeed = Math.max(65, combatant.setup.combatSpeed ?? 120);
  const alignment = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(headingError))));
  const tractorLocked = isTractorLocked(combatant, enemy);
  const desiredSpeed = tractorLocked
    ? Math.min(baseSpeed * targetSpeedFactor * alignment, 25)
    : baseSpeed * targetSpeedFactor * alignment;
  const acceleration = Math.max(
    12,
    combatant.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION
  );
  const speedDelta = clamp(
    desiredSpeed - combatant.speed,
    -acceleration * 1.35 * deltaSeconds,
    acceleration * deltaSeconds
  );
  combatant.speed = clamp(combatant.speed + speedDelta, 0, baseSpeed * 1.05);

  combatant.position.x = clamp(
    combatant.position.x + Math.cos(combatant.headingRadians) * combatant.speed * deltaSeconds,
    EDGE_PADDING,
    arena.width - EDGE_PADDING
  );
  combatant.position.y = clamp(
    combatant.position.y + Math.sin(combatant.headingRadians) * combatant.speed * deltaSeconds,
    EDGE_PADDING,
    arena.height - EDGE_PADDING
  );
  resolveArenaObstacles(combatant, arena);
}
