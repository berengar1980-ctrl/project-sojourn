import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';
import type { ShieldDamageSource, ShieldImpactEffect } from '../../core/shield-types';
import type { ShipHardpoints, ShipWeaponFamily } from '../../core/ship-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import { advanceShieldImpacts, applyShieldHit } from '../shields/shield-service';
import { detectShipMine } from './mine-detection-service';

export type StrategicCombatSide = 'attacker' | 'defender';
export type CombatTactic = 'fight' | 'kite' | 'flee' | 'minefield';
export type CombatImpactLayer = 'shield' | 'hull' | 'miss' | 'obstacle';
export type CombatProjectileKind = 'plasma' | 'missile' | 'autocannon';
export type CombatBeamKind = 'laser' | 'rail';

export interface CombatPoint {
  readonly x: number;
  readonly y: number;
}

export interface CombatShieldGeometry {
  readonly centerOffset: CombatPoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly modifier: number;
}

export interface StrategicCombatantSetup {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldGeometry?: CombatShieldGeometry;
  readonly hullHp: number;
  readonly weapons: readonly ShipComponentDefinition[];
  readonly hitChance: number;
  readonly dodgeChance: number;
  readonly damageMultiplier: number;
  readonly criticalChance: number;
  readonly cycleTimeMultiplier: number;
  readonly preferredTactic?: CombatTactic;
  readonly combatSpeed?: number;
  readonly turnRateRadiansPerSecond?: number;
  readonly accelerationMetersPerSecond2?: number;
  readonly mines?: readonly ShipMineDefinition[];
  readonly sensorCrewSkill?: number;
  readonly sensorTier?: number;
  readonly sensorRangeMeters?: number;
  readonly sensorRangeMultiplier?: number;
  readonly aiControlled?: boolean;
  readonly aiAggression?: number;
  readonly factionId?: 'civilian' | 'pirates' | 'pirates2';
  readonly pirateMark?: 'broken-spear' | 'black-tide';
}

export interface StrategicCombatantSnapshot {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
  readonly shieldMaxHp: number;
  readonly hullHp: number;
  readonly hullMaxHp: number;
  readonly position: CombatPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly tactic: CombatTactic;
  readonly factionId?: 'civilian' | 'pirates' | 'pirates2';
  readonly pirateMark?: 'broken-spear' | 'black-tide';
  readonly shieldImpacts: readonly ShieldImpactEffect[];
}

export interface CombatProjectileSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly kind: CombatProjectileKind;
  readonly family: ShipWeaponFamily;
  readonly position: CombatPoint;
  readonly target: CombatPoint;
  readonly ttlSeconds: number;
}

export interface CombatBeamSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly kind: CombatBeamKind;
  readonly family: ShipWeaponFamily;
  readonly origin: CombatPoint;
  readonly end: CombatPoint;
  readonly weaponIndex: number;
  readonly ttlSeconds: number;
  readonly maxTtlSeconds: number;
}

export interface CombatMineSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly mineId: string;
  readonly kind: ShipMineDefinition['kind'];
  readonly name: string;
  readonly tier: number;
  readonly position: CombatPoint;
  readonly armed: boolean;
  readonly radius: number;
  readonly detection: MineContactLevel;
}

export interface CombatImpactSnapshot {
  readonly serial: number;
  readonly target: StrategicCombatSide;
  readonly layer: CombatImpactLayer;
  readonly position: CombatPoint;
  readonly damage: number;
}

export interface StrategicCombatSnapshot {
  readonly attacker: StrategicCombatantSnapshot;
  readonly defender: StrategicCombatantSnapshot;
  readonly elapsedSeconds: number;
  readonly winner: StrategicCombatSide | null;
  readonly lastEvent: string;
  readonly projectiles: readonly CombatProjectileSnapshot[];
  readonly beams: readonly CombatBeamSnapshot[];
  readonly mines: readonly CombatMineSnapshot[];
  readonly lastImpact: CombatImpactSnapshot | null;
  readonly arena: {
    readonly width: number;
    readonly height: number;
  };
}

export interface StrategicCombatObstacle {
  readonly id: string;
  readonly position: CombatPoint;
  readonly radius: number;
}

export interface StrategicCombatArenaOptions {
  readonly width: number;
  readonly height: number;
  readonly attackerPosition?: CombatPoint;
  readonly defenderPosition?: CombatPoint;
  readonly obstacles?: readonly StrategicCombatObstacle[];
}

export interface StrategicCombatService {
  getSnapshot(): StrategicCombatSnapshot;
  tick(deltaSeconds: number): StrategicCombatSnapshot;
  setTactic(side: StrategicCombatSide, tactic: CombatTactic): void;
}

interface MutableCombatant {
  readonly setup: StrategicCombatantSetup;
  readonly shieldMaxHp: number;
  readonly hullMaxHp: number;
  readonly cooldowns: number[];
  position: { x: number; y: number };
  headingRadians: number;
  speed: number;
  turnRateRadiansPerSecond: number;
  angularThrust: number;
  tactic: CombatTactic;
  shieldHp: number;
  hullHp: number;
  shieldImpacts: ShieldImpactEffect[];
  mineStock: ShipMineDefinition[];
  mineCooldown: number;
}

interface MutableProjectile {
  id: number;
  owner: StrategicCombatSide;
  kind: CombatProjectileKind;
  family: ShipWeaponFamily;
  position: { x: number; y: number };
  target: StrategicCombatSide;
  speed: number;
  ttlSeconds: number;
  shieldDamage: number;
  hullDamage: number;
  critical: boolean;
}

interface MutableBeam {
  id: number;
  owner: StrategicCombatSide;
  kind: CombatBeamKind;
  family: ShipWeaponFamily;
  origin: CombatPoint;
  end: CombatPoint;
  weaponIndex: number;
  ttlSeconds: number;
  maxTtlSeconds: number;
}

interface MutableMine {
  id: number;
  owner: StrategicCombatSide;
  position: { x: number; y: number };
  armedSeconds: number;
  pursuitRemaining: number;
  definition: ShipMineDefinition;
}

const DEFAULT_ARENA_WIDTH = 4200;
const DEFAULT_ARENA_HEIGHT = 2600;
const EDGE_PADDING = 160;
const EDGE_WARNING_DISTANCE = 650;
const MINE_DROP_COOLDOWN = 7.5;
const COMBAT_DAMAGE_SCALE = 0.09;
const DEFAULT_TURN_RATE = 0.72;
const DEFAULT_ACCELERATION = 34;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function distance(a: CombatPoint, b: CombatPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function createCombatShieldGeometry(
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number
): CombatShieldGeometry {
  const scale = nominalLengthMeters / hardpoints.sourceWidth;
  return {
    centerOffset: {
      x: (hardpoints.shield.centerX - hardpoints.pivot.x) * scale,
      y: (hardpoints.shield.centerY - hardpoints.pivot.y) * scale,
    },
    radiusX: Math.max(1, hardpoints.shield.radiusX * scale),
    radiusY: Math.max(1, hardpoints.shield.radiusY * scale),
    modifier: Math.max(0.01, hardpoints.shield.modifier),
  };
}

function normalize(dx: number, dy: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  return length <= 0.0001 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

function wrapAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function rotate(point: CombatPoint, angle: number): CombatPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function createCombatant(
  setup: StrategicCombatantSetup,
  side: StrategicCombatSide,
  arena: StrategicCombatArenaOptions
): MutableCombatant {
  const configured = side === 'attacker' ? arena.attackerPosition : arena.defenderPosition;
  const startX = configured?.x ?? (side === 'attacker' ? arena.width * 0.28 : arena.width * 0.72);
  const startY = configured?.y ?? arena.height * (side === 'attacker' ? 0.46 : 0.54);
  return {
    setup,
    shieldMaxHp: Math.max(0, setup.shieldHp),
    hullMaxHp: Math.max(1, setup.hullHp),
    shieldHp: Math.max(0, setup.shieldHp),
    hullHp: Math.max(1, setup.hullHp),
    cooldowns: setup.weapons.map((_, index) => 0.7 + index * 0.18),
    position: { x: startX, y: startY },
    headingRadians: side === 'attacker' ? 0 : Math.PI,
    speed: 0,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    tactic: setup.preferredTactic ?? 'fight',
    shieldImpacts: [],
    mineStock: [...(setup.mines ?? [])],
    mineCooldown: 0,
  };
}

function snapshot(combatant: MutableCombatant): StrategicCombatantSnapshot {
  return {
    id: combatant.setup.id,
    name: combatant.setup.name,
    shipId: combatant.setup.shipId,
    shieldHp: combatant.shieldHp,
    shieldMaxHp: combatant.shieldMaxHp,
    hullHp: combatant.hullHp,
    hullMaxHp: combatant.hullMaxHp,
    position: { ...combatant.position },
    headingRadians: combatant.headingRadians,
    speed: combatant.speed,
    turnRateRadiansPerSecond: combatant.turnRateRadiansPerSecond,
    angularThrust: combatant.angularThrust,
    tactic: combatant.tactic,
    ...(combatant.setup.factionId ? { factionId: combatant.setup.factionId } : {}),
    ...(combatant.setup.pirateMark ? { pirateMark: combatant.setup.pirateMark } : {}),
    shieldImpacts: combatant.shieldImpacts.map((impact) => ({ ...impact })),
  };
}

function weaponKind(family: ShipWeaponFamily): CombatProjectileKind | CombatBeamKind {
  if (family === 'guided_missile' || family === 'he_missile') return 'missile';
  if (family === 'plasma_battery') return 'plasma';
  if (family === 'railgun') return 'rail';
  if (family === 'autocannon') return 'autocannon';
  return 'laser';
}

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

function updateAiTactic(
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

function resolveArenaObstacles(
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

function resolveCombatantCollision(first: MutableCombatant, second: MutableCombatant): void {
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

function mineDetection(
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

function moveCombatant(
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
  if (boundary) {
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
  const desiredSpeed = baseSpeed * targetSpeedFactor * alignment;
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

function scaledDamage(raw: number, attacker: MutableCombatant, critical: boolean): number {
  const criticalMultiplier = critical ? 1.5 : 1;
  return Math.max(
    1,
    raw * attacker.setup.damageMultiplier * criticalMultiplier * COMBAT_DAMAGE_SCALE
  );
}

function combatShieldGeometry(target: MutableCombatant): CombatShieldGeometry {
  return (
    target.setup.shieldGeometry ?? {
      centerOffset: { x: 0, y: 0 },
      radiusX: 48,
      radiusY: 48,
      modifier: 1,
    }
  );
}

function combatShieldCenter(target: MutableCombatant): CombatPoint {
  const geometry = combatShieldGeometry(target);
  const offset = rotate(geometry.centerOffset, target.headingRadians);
  return {
    x: target.position.x + offset.x,
    y: target.position.y + offset.y,
  };
}

interface ShieldSegmentHit {
  readonly point: CombatPoint;
  readonly surfaceAnchor: CombatPoint;
  readonly t: number;
}

function segmentShieldHit(
  from: CombatPoint,
  to: CombatPoint,
  target: MutableCombatant
): ShieldSegmentHit | null {
  if (target.shieldHp <= 0) return null;
  const geometry = combatShieldGeometry(target);
  const center = combatShieldCenter(target);
  const start = rotate({ x: from.x - center.x, y: from.y - center.y }, -target.headingRadians);
  const end = rotate({ x: to.x - center.x, y: to.y - center.y }, -target.headingRadians);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const rx = Math.max(1, geometry.radiusX);
  const ry = Math.max(1, geometry.radiusY);
  const a = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (a <= 0.000001) return null;
  const b = 2 * ((start.x * dx) / (rx * rx) + (start.y * dy) / (ry * ry));
  const c = (start.x * start.x) / (rx * rx) + (start.y * start.y) / (ry * ry) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((value) => value >= 0 && value <= 1)
    .sort((first, second) => first - second)[0];
  if (t == null) return null;
  const local = { x: start.x + dx * t, y: start.y + dy * t };
  const worldOffset = rotate(local, target.headingRadians);
  return {
    point: { x: center.x + worldOffset.x, y: center.y + worldOffset.y },
    surfaceAnchor: { x: local.x / rx, y: local.y / ry },
    t,
  };
}

function impactAnchor(target: MutableCombatant, sourcePosition: CombatPoint): CombatPoint {
  const outwardWorld = normalize(
    sourcePosition.x - target.position.x,
    sourcePosition.y - target.position.y
  );
  const local = rotate(outwardWorld, -target.headingRadians);
  const length = Math.hypot(local.x, local.y) || 1;
  return { x: local.x / length, y: local.y / length };
}

function applyDamage(
  target: MutableCombatant,
  shieldDamage: number,
  hullDamage: number,
  attacker: MutableCombatant,
  critical: boolean,
  sourcePosition: CombatPoint,
  source: ShieldDamageSource,
  impactId: number,
  shieldImpact?: ShieldSegmentHit
): { layer: CombatImpactLayer; damage: number; point: CombatPoint } {
  if (target.shieldHp > 0) {
    const geometry = combatShieldGeometry(target);
    const state = {
      maxHp: target.shieldMaxHp,
      modifier: geometry.modifier,
      currentHp: target.shieldHp,
    };
    const impactPoint = shieldImpact?.point ?? combatShieldCenter(target);
    const center = combatShieldCenter(target);
    const outward = normalize(impactPoint.x - center.x, impactPoint.y - center.y);
    const result = applyShieldHit(
      state,
      {
        source,
        point: { ...impactPoint },
        normal: outward,
        surfaceAnchor: shieldImpact?.surfaceAnchor ?? impactAnchor(target, sourcePosition),
        directDamage: scaledDamage(shieldDamage, attacker, critical),
      },
      impactId
    );
    target.shieldHp = state.currentHp;
    target.shieldImpacts.push(result.impact);
    return { layer: 'shield', damage: result.absorbedDamage, point: impactPoint };
  }

  const damage = Math.min(target.hullHp, scaledDamage(hullDamage, attacker, critical));
  target.hullHp = Math.max(0, target.hullHp - damage);
  return { layer: 'hull', damage, point: { ...target.position } };
}

function projectileSpeed(kind: CombatProjectileKind): number {
  if (kind === 'missile') return 360;
  if (kind === 'plasma') return 520;
  return 900;
}

function segmentCircleHit(
  from: CombatPoint,
  to: CombatPoint,
  obstacle: StrategicCombatObstacle
): { point: CombatPoint; t: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - obstacle.position.x;
  const fy = from.y - obstacle.position.y;
  const a = dx * dx + dy * dy;
  if (a <= 0.000001) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - obstacle.radius * obstacle.radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = [t1, t2].filter((value) => value >= 0 && value <= 1).sort((x, y) => x - y)[0];
  if (t == null) return null;
  return { point: { x: from.x + dx * t, y: from.y + dy * t }, t };
}

function firstObstacleHit(
  from: CombatPoint,
  to: CombatPoint,
  obstacles: readonly StrategicCombatObstacle[]
): { obstacle: StrategicCombatObstacle; point: CombatPoint; t: number } | null {
  return (
    obstacles
      .flatMap((obstacle) => {
        const hit = segmentCircleHit(from, to, obstacle);
        return hit ? [{ obstacle, ...hit }] : [];
      })
      .sort((first, second) => first.t - second.t)[0] ?? null
  );
}

interface StrategicCombatRuntime {
  readonly arena: StrategicCombatArenaOptions;
  readonly attacker: MutableCombatant;
  readonly defender: MutableCombatant;
  readonly random: () => number;
  readonly projectiles: MutableProjectile[];
  readonly beams: MutableBeam[];
  readonly mines: MutableMine[];
  elapsedSeconds: number;
  winner: StrategicCombatSide | null;
  lastEvent: string;
  projectileSerial: number;
  beamSerial: number;
  mineSerial: number;
  impactSerial: number;
  lastImpact: CombatImpactSnapshot | null;
}

function runtimeCombatant(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide
): MutableCombatant {
  return side === 'attacker' ? runtime.attacker : runtime.defender;
}

function runtimeEnemy(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide
): MutableCombatant {
  return side === 'attacker' ? runtime.defender : runtime.attacker;
}

function noteRuntimeImpact(
  runtime: StrategicCombatRuntime,
  target: StrategicCombatSide,
  layer: CombatImpactLayer,
  damage: number,
  point: CombatPoint
): void {
  runtime.impactSerial += 1;
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target,
    layer,
    damage,
    position: { ...point },
  };
}

function addRuntimeBeam(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  kind: CombatBeamKind,
  family: ShipWeaponFamily,
  origin: CombatPoint,
  end: CombatPoint,
  weaponIndex: number
): void {
  runtime.beamSerial += 1;
  const maxTtlSeconds = kind === 'laser' ? 0.16 : 0.09;
  runtime.beams.push({
    id: runtime.beamSerial,
    owner: side,
    kind,
    family,
    origin: { ...origin },
    end: { ...end },
    weaponIndex,
    ttlSeconds: maxTtlSeconds,
    maxTtlSeconds,
  });
}

function fireRuntimeInstantWeapon(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  weapon: ShipComponentDefinition,
  weaponIndex: number,
  kind: CombatBeamKind,
  hit: boolean,
  critical: boolean
): string {
  if (!weapon.weapon) return '';
  const shield = combatShieldGeometry(target);
  const center = combatShieldCenter(target);
  const missDistance = Math.max(shield.radiusX, shield.radiusY) + 55;
  const aimCenter = target.shieldHp > 0 ? center : target.position;
  const targetPoint = hit
    ? aimCenter
    : {
        x: aimCenter.x + Math.cos(target.headingRadians + Math.PI / 2) * missDistance,
        y: aimCenter.y + Math.sin(target.headingRadians + Math.PI / 2) * missDistance,
      };
  const shieldHit = hit ? segmentShieldHit(source.position, targetPoint, target) : null;
  const beamEnd = shieldHit?.point ?? targetPoint;
  const obstacle = firstObstacleHit(source.position, beamEnd, runtime.arena.obstacles ?? []);
  const targetSide: StrategicCombatSide = side === 'attacker' ? 'defender' : 'attacker';

  if (obstacle) {
    addRuntimeBeam(
      runtime,
      side,
      kind,
      weapon.weapon.family,
      source.position,
      obstacle.point,
      weaponIndex
    );
    noteRuntimeImpact(runtime, targetSide, 'obstacle', 0, obstacle.point);
    return source.setup.name + ': ' + weapon.name + ' trifft Hindernis';
  }

  addRuntimeBeam(runtime, side, kind, weapon.weapon.family, source.position, beamEnd, weaponIndex);
  if (!hit) {
    noteRuntimeImpact(runtime, targetSide, 'miss', 0, targetPoint);
    return source.setup.name + ': ' + weapon.name + ' verfehlt';
  }

  runtime.impactSerial += 1;
  const result = applyDamage(
    target,
    weapon.weapon.shieldDamage,
    weapon.weapon.hullDamage,
    source,
    critical,
    source.position,
    'laser',
    runtime.impactSerial,
    shieldHit ?? undefined
  );
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target: targetSide,
    layer: result.layer,
    damage: result.damage,
    position: { ...result.point },
  };
  return (
    source.setup.name +
    ': ' +
    weapon.name +
    ' trifft ' +
    (result.layer === 'shield' ? 'Schild' : 'Hülle') +
    ' -' +
    Math.round(result.damage)
  );
}

function fireRuntimeProjectileWeapon(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  weapon: ShipComponentDefinition,
  kind: CombatProjectileKind,
  hit: boolean,
  critical: boolean
): string {
  if (!weapon.weapon) return '';
  runtime.projectileSerial += 1;
  runtime.projectiles.push({
    id: runtime.projectileSerial,
    owner: side,
    kind,
    family: weapon.weapon.family,
    position: { ...source.position },
    target: side === 'attacker' ? 'defender' : 'attacker',
    speed: projectileSpeed(kind),
    ttlSeconds: Math.max(
      0.4,
      distance(source.position, target.position) / projectileSpeed(kind) + 0.8
    ),
    shieldDamage: hit ? weapon.weapon.shieldDamage : 0,
    hullDamage: hit ? weapon.weapon.hullDamage : 0,
    critical: hit && critical,
  });
  return source.setup.name + ': ' + weapon.name + ' abgefeuert' + (critical ? ' · KRITISCH' : '');
}

function fireRuntimeWeapon(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  weapon: ShipComponentDefinition,
  weaponIndex: number
): string {
  if (!weapon.weapon || distance(source.position, target.position) > weapon.weapon.rangeMeters) {
    return '';
  }
  const hitChance = clamp(source.setup.hitChance - target.setup.dodgeChance, 0.2, 0.98);
  const critical = runtime.random() < clamp(source.setup.criticalChance, 0, 0.5);
  const kind = weaponKind(weapon.weapon.family);
  const hit = runtime.random() <= hitChance;
  if (kind === 'laser' || kind === 'rail') {
    return fireRuntimeInstantWeapon(
      runtime,
      side,
      source,
      target,
      weapon,
      weaponIndex,
      kind,
      hit,
      critical
    );
  }
  return fireRuntimeProjectileWeapon(runtime, side, source, target, weapon, kind, hit, critical);
}

function advanceRuntimeWeapons(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  deltaSeconds: number
): void {
  for (let index = 0; index < source.setup.weapons.length; index += 1) {
    source.cooldowns[index] = Math.max(0, (source.cooldowns[index] ?? 0) - deltaSeconds);
    if ((source.cooldowns[index] ?? 0) > 0 || target.hullHp <= 0) continue;
    const weapon = source.setup.weapons[index];
    if (!weapon?.weapon || distance(source.position, target.position) > weapon.weapon.rangeMeters) {
      continue;
    }
    const event = fireRuntimeWeapon(runtime, side, source, target, weapon, index);
    source.cooldowns[index] =
      weapon.weapon.cooldownSeconds * clamp(source.setup.cycleTimeMultiplier, 0.4, 2);
    if (event) runtime.lastEvent = event;
  }
}

function recordProjectileDamage(
  runtime: StrategicCombatRuntime,
  projectile: MutableProjectile,
  source: MutableCombatant,
  target: MutableCombatant,
  shieldHit?: SegmentShieldHit
): ReturnType<typeof applyDamage> {
  runtime.impactSerial += 1;
  const result = applyDamage(
    target,
    projectile.shieldDamage,
    projectile.hullDamage,
    source,
    projectile.critical,
    projectile.position,
    projectile.kind === 'missile' ? 'missile' : 'laser',
    runtime.impactSerial,
    shieldHit
  );
  const targetSide: StrategicCombatSide = projectile.owner === 'attacker' ? 'defender' : 'attacker';
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target: targetSide,
    layer: result.layer,
    damage: result.damage,
    position: { ...result.point },
  };
  return result;
}

function advanceRuntimeProjectile(
  runtime: StrategicCombatRuntime,
  projectile: MutableProjectile,
  index: number,
  deltaSeconds: number
): void {
  const source = runtimeCombatant(runtime, projectile.owner);
  const target = runtimeEnemy(runtime, projectile.owner);
  if (target.hullHp <= 0) {
    runtime.projectiles.splice(index, 1);
    return;
  }

  const dx = target.position.x - projectile.position.x;
  const dy = target.position.y - projectile.position.y;
  const remaining = Math.hypot(dx, dy);
  const step = projectile.speed * deltaSeconds;
  projectile.ttlSeconds -= deltaSeconds;
  const direction =
    projectile.shieldDamage <= 0 && projectile.hullDamage <= 0
      ? normalize(dx - dy * 0.14, dy + dx * 0.14)
      : normalize(dx, dy);
  const next = {
    x: projectile.position.x + direction.x * step,
    y: projectile.position.y + direction.y * step,
  };
  const shieldHit =
    projectile.shieldDamage > 0 || projectile.hullDamage > 0
      ? segmentShieldHit(projectile.position, next, target)
      : null;
  const obstacle = firstObstacleHit(projectile.position, next, runtime.arena.obstacles ?? []);

  if (obstacle && (!shieldHit || obstacle.t < shieldHit.t)) {
    noteRuntimeImpact(
      runtime,
      projectile.owner === 'attacker' ? 'defender' : 'attacker',
      'obstacle',
      0,
      obstacle.point
    );
    runtime.lastEvent =
      source.setup.name + ': ' + projectile.family.replaceAll('_', ' ') + ' trifft Hindernis';
    runtime.projectiles.splice(index, 1);
    return;
  }
  if (projectile.shieldDamage <= 0 && projectile.hullDamage <= 0) {
    projectile.position = next;
    if (projectile.ttlSeconds <= 0) runtime.projectiles.splice(index, 1);
    return;
  }
  if (shieldHit) {
    const result = recordProjectileDamage(runtime, projectile, source, target, shieldHit);
    runtime.lastEvent =
      source.setup.name +
      ': ' +
      projectile.family.replaceAll('_', ' ') +
      ' trifft Schild -' +
      Math.round(result.damage);
    runtime.projectiles.splice(index, 1);
    return;
  }
  if (remaining <= Math.max(18, step) || projectile.ttlSeconds <= 0) {
    const result = recordProjectileDamage(runtime, projectile, source, target);
    runtime.lastEvent =
      source.setup.name +
      ': ' +
      projectile.family.replaceAll('_', ' ') +
      ' trifft ' +
      (result.layer === 'shield' ? 'Schild' : 'Hülle') +
      ' -' +
      Math.round(result.damage);
    runtime.projectiles.splice(index, 1);
    return;
  }
  projectile.position = next;
}

function advanceRuntimeProjectiles(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.projectiles.length - 1; index >= 0; index -= 1) {
    advanceRuntimeProjectile(runtime, runtime.projectiles[index]!, index, deltaSeconds);
  }
}

function chooseRuntimeMine(
  source: MutableCombatant,
  target: MutableCombatant
): ShipMineDefinition | null {
  if (source.mineStock.length === 0) return null;
  const preferredKind =
    target.shieldHp > 0
      ? 'ion'
      : distance(source.position, target.position) > 360
        ? 'hunter'
        : 'shaped_charge';
  return (
    source.mineStock.find((mine) => mine.kind === preferredKind) ?? source.mineStock[0] ?? null
  );
}

function maybeDropRuntimeMine(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  deltaSeconds: number
): void {
  source.mineCooldown = Math.max(0, source.mineCooldown - deltaSeconds);
  if (source.tactic !== 'minefield' || source.mineStock.length === 0 || source.mineCooldown > 0) {
    return;
  }
  if (distance(source.position, target.position) > 720) return;
  const definition = chooseRuntimeMine(source, target);
  if (!definition) return;
  const stockIndex = source.mineStock.findIndex((mine) => mine.id === definition.id);
  if (stockIndex >= 0) source.mineStock.splice(stockIndex, 1);

  runtime.mineSerial += 1;
  source.mineCooldown = MINE_DROP_COOLDOWN;
  runtime.mines.push({
    id: runtime.mineSerial,
    owner: side,
    position: { ...source.position },
    armedSeconds: 0.7,
    pursuitRemaining: definition.pursuitSeconds,
    definition,
  });
  runtime.lastEvent = source.setup.name + ': ' + definition.name + ' gelegt';
}

function advanceRuntimeMine(
  runtime: StrategicCombatRuntime,
  mine: MutableMine,
  index: number,
  deltaSeconds: number
): void {
  mine.armedSeconds = Math.max(0, mine.armedSeconds - deltaSeconds);
  const target = runtimeEnemy(runtime, mine.owner);
  if (target.hullHp <= 0) {
    runtime.mines.splice(index, 1);
    return;
  }
  if (
    mine.armedSeconds <= 0 &&
    mine.pursuitRemaining > 0 &&
    mine.definition.pursuitSpeedMetersPerSecond > 0
  ) {
    const direction = normalize(
      target.position.x - mine.position.x,
      target.position.y - mine.position.y
    );
    mine.position.x += direction.x * mine.definition.pursuitSpeedMetersPerSecond * deltaSeconds;
    mine.position.y += direction.y * mine.definition.pursuitSpeedMetersPerSecond * deltaSeconds;
    mine.pursuitRemaining = Math.max(0, mine.pursuitRemaining - deltaSeconds);
  }
  if (mine.armedSeconds > 0) return;
  if (distance(mine.position, target.position) > mine.definition.triggerRadiusMeters) return;

  runtime.impactSerial += 1;
  const source = runtimeCombatant(runtime, mine.owner);
  const result = applyDamage(
    target,
    mine.definition.shieldDamage,
    mine.definition.hullDamage,
    source,
    false,
    mine.position,
    'missile',
    runtime.impactSerial
  );
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target: mine.owner === 'attacker' ? 'defender' : 'attacker',
    layer: result.layer,
    damage: result.damage,
    position: { ...target.position },
  };
  runtime.lastEvent =
    source.setup.name +
    ': ' +
    mine.definition.name +
    ' detoniert · ' +
    (result.layer === 'shield' ? 'Schild' : 'Hülle') +
    ' -' +
    Math.round(result.damage);
  runtime.mines.splice(index, 1);
}

function advanceRuntimeMines(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.mines.length - 1; index >= 0; index -= 1) {
    advanceRuntimeMine(runtime, runtime.mines[index]!, index, deltaSeconds);
  }
}

function runtimeCombatantEscaped(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): boolean {
  if (combatant.tactic !== 'flee') return false;
  const atEdge =
    combatant.position.x <= EDGE_PADDING + 8 ||
    combatant.position.x >= arena.width - EDGE_PADDING - 8 ||
    combatant.position.y <= EDGE_PADDING + 8 ||
    combatant.position.y >= arena.height - EDGE_PADDING - 8;
  return atEdge && distance(combatant.position, enemy.position) > 900;
}

function resolveRuntimeWinner(runtime: StrategicCombatRuntime): void {
  if (runtime.winner) return;
  if (runtime.defender.hullHp <= 0) {
    runtime.winner = 'attacker';
    runtime.lastEvent = runtime.attacker.setup.name + ' gewinnt das Gefecht';
    return;
  }
  if (runtime.attacker.hullHp <= 0) {
    runtime.winner = 'defender';
    runtime.lastEvent = runtime.defender.setup.name + ' gewinnt das Gefecht';
    return;
  }
  if (runtimeCombatantEscaped(runtime.attacker, runtime.defender, runtime.arena)) {
    runtime.winner = 'defender';
    runtime.lastEvent = runtime.attacker.setup.name + ' entkommt aus dem Gefecht';
  } else if (runtimeCombatantEscaped(runtime.defender, runtime.attacker, runtime.arena)) {
    runtime.winner = 'attacker';
    runtime.lastEvent = runtime.defender.setup.name + ' entkommt aus dem Gefecht';
  }
}

function runtimeSnapshot(runtime: StrategicCombatRuntime): StrategicCombatSnapshot {
  return {
    attacker: snapshot(runtime.attacker),
    defender: snapshot(runtime.defender),
    elapsedSeconds: runtime.elapsedSeconds,
    winner: runtime.winner,
    lastEvent: runtime.lastEvent,
    projectiles: runtime.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      kind: projectile.kind,
      family: projectile.family,
      position: { ...projectile.position },
      target: { ...runtimeEnemy(runtime, projectile.owner).position },
      ttlSeconds: projectile.ttlSeconds,
    })),
    beams: runtime.beams.map((beam) => ({
      ...beam,
      origin: { ...beam.origin },
      end: { ...beam.end },
    })),
    mines: runtime.mines.map((mine) => ({
      id: mine.id,
      owner: mine.owner,
      mineId: mine.definition.id,
      kind: mine.definition.kind,
      name: mine.definition.name,
      tier: mine.definition.tier,
      position: { ...mine.position },
      armed: mine.armedSeconds <= 0,
      radius: mine.definition.triggerRadiusMeters,
      detection:
        mine.owner === 'attacker'
          ? 'identified'
          : mineDetection(mine.definition, runtime.attacker, mine.position),
    })),
    lastImpact: runtime.lastImpact,
    arena: { width: runtime.arena.width, height: runtime.arena.height },
  };
}

function advanceRuntimeBeams(runtime: StrategicCombatRuntime, deltaSeconds: number): void {
  for (let index = runtime.beams.length - 1; index >= 0; index -= 1) {
    runtime.beams[index]!.ttlSeconds -= deltaSeconds;
    if (runtime.beams[index]!.ttlSeconds <= 0) runtime.beams.splice(index, 1);
  }
}

function tickStrategicCombat(
  runtime: StrategicCombatRuntime,
  deltaSeconds: number
): StrategicCombatSnapshot {
  if (runtime.winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return runtimeSnapshot(runtime);
  }
  const dt = Math.min(deltaSeconds, 0.08);
  runtime.elapsedSeconds += dt;
  runtime.attacker.shieldImpacts = advanceShieldImpacts(runtime.attacker.shieldImpacts, dt);
  runtime.defender.shieldImpacts = advanceShieldImpacts(runtime.defender.shieldImpacts, dt);
  advanceRuntimeBeams(runtime, dt);
  updateAiTactic(runtime.attacker, runtime.defender, runtime.elapsedSeconds);
  updateAiTactic(runtime.defender, runtime.attacker, runtime.elapsedSeconds);
  moveCombatant(runtime.attacker, runtime.defender, 'attacker', dt, runtime.arena, runtime.mines);
  moveCombatant(runtime.defender, runtime.attacker, 'defender', dt, runtime.arena, runtime.mines);
  resolveCombatantCollision(runtime.attacker, runtime.defender);
  resolveArenaObstacles(runtime.attacker, runtime.arena);
  resolveArenaObstacles(runtime.defender, runtime.arena);
  maybeDropRuntimeMine(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  maybeDropRuntimeMine(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  advanceRuntimeWeapons(runtime, 'attacker', runtime.attacker, runtime.defender, dt);
  advanceRuntimeWeapons(runtime, 'defender', runtime.defender, runtime.attacker, dt);
  advanceRuntimeProjectiles(runtime, dt);
  advanceRuntimeMines(runtime, dt);
  resolveRuntimeWinner(runtime);
  return runtimeSnapshot(runtime);
}

function createStrategicCombatRuntime(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed: number,
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatRuntime {
  const arena: StrategicCombatArenaOptions = {
    width: Math.max(800, arenaOptions?.width ?? DEFAULT_ARENA_WIDTH),
    height: Math.max(600, arenaOptions?.height ?? DEFAULT_ARENA_HEIGHT),
    ...(arenaOptions?.attackerPosition ? { attackerPosition: arenaOptions.attackerPosition } : {}),
    ...(arenaOptions?.defenderPosition ? { defenderPosition: arenaOptions.defenderPosition } : {}),
    ...(arenaOptions?.obstacles ? { obstacles: arenaOptions.obstacles } : {}),
  };
  return {
    arena,
    attacker: createCombatant(attackerSetup, 'attacker', arena),
    defender: createCombatant(defenderSetup, 'defender', arena),
    random: createRng(seed),
    projectiles: [],
    beams: [],
    mines: [],
    elapsedSeconds: 0,
    winner: null,
    lastEvent: 'Kampfkontakt hergestellt',
    projectileSerial: 0,
    beamSerial: 0,
    mineSerial: 0,
    impactSerial: 0,
    lastImpact: null,
  };
}

export function createStrategicCombatService(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed = hashSeed(attackerSetup.id + ':' + defenderSetup.id),
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatService {
  const runtime = createStrategicCombatRuntime(attackerSetup, defenderSetup, seed, arenaOptions);
  return {
    getSnapshot: () => runtimeSnapshot(runtime),
    setTactic(side, tactic) {
      const combatant = runtimeCombatant(runtime, side);
      combatant.tactic = tactic;
      runtime.lastEvent = combatant.setup.name + ': Taktik ' + tactic.toUpperCase();
    },
    tick: (deltaSeconds) => tickStrategicCombat(runtime, deltaSeconds),
  };
}
