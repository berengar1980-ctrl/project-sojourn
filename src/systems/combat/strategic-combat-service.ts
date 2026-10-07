import type { MineContactLevel, ShipMineDefinition } from '../../core/combat-types';
import type { ShieldDamageSource, ShieldImpactEffect } from '../../core/shield-types';
import type { ShipWeaponFamily } from '../../core/ship-types';
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

export interface StrategicCombatantSetup {
  readonly id: string;
  readonly name: string;
  readonly shipId: string;
  readonly shieldHp: number;
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

const DEFAULT_ARENA_WIDTH = 2600;
const DEFAULT_ARENA_HEIGHT = 1600;
const EDGE_PADDING = 140;
const MINE_DROP_COOLDOWN = 7.5;
const COMBAT_DAMAGE_SCALE = 0.16;
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
        entry.level !== 'hidden' &&
        entry.range <= entry.mine.definition.triggerRadiusMeters * 2.4
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
    side === 'attacker'
      ? { x: -toward.y, y: toward.x }
      : { x: toward.y, y: -toward.x };
  const desired = preferredRange(combatant);

  let direction = toward;
  let targetSpeedFactor = 0.88;
  if (combatant.tactic === 'flee') {
    direction = { x: -toward.x, y: -toward.y };
    targetSpeedFactor = 1;
  } else if (range < desired * 0.72) {
    direction = normalize(-toward.x * 0.8 + perpendicular.x * 0.45, -toward.y * 0.8 + perpendicular.y * 0.45);
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
  const acceleration = Math.max(12, combatant.setup.accelerationMetersPerSecond2 ?? DEFAULT_ACCELERATION);
  const speedDelta = clamp(desiredSpeed - combatant.speed, -acceleration * 1.35 * deltaSeconds, acceleration * deltaSeconds);
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
  return Math.max(1, raw * attacker.setup.damageMultiplier * criticalMultiplier * COMBAT_DAMAGE_SCALE);
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
  impactId: number
): { layer: CombatImpactLayer; damage: number } {
  if (target.shieldHp > 0) {
    const state = {
      maxHp: target.shieldMaxHp,
      modifier: 1,
      currentHp: target.shieldHp,
    };
    const outward = normalize(
      sourcePosition.x - target.position.x,
      sourcePosition.y - target.position.y
    );
    const result = applyShieldHit(
      state,
      {
        source,
        point: { ...target.position },
        normal: outward,
        surfaceAnchor: impactAnchor(target, sourcePosition),
        directDamage: scaledDamage(shieldDamage, attacker, critical),
      },
      impactId
    );
    target.shieldHp = state.currentHp;
    target.shieldImpacts.push(result.impact);
    return { layer: 'shield', damage: result.absorbedDamage };
  }

  const damage = Math.min(
    target.hullHp,
    scaledDamage(hullDamage, attacker, critical)
  );
  target.hullHp = Math.max(0, target.hullHp - damage);
  return { layer: 'hull', damage };
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

export function createStrategicCombatService(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed = hashSeed(attackerSetup.id + ':' + defenderSetup.id),
  arenaOptions?: StrategicCombatArenaOptions
): StrategicCombatService {
  const arena: StrategicCombatArenaOptions = {
    width: Math.max(800, arenaOptions?.width ?? DEFAULT_ARENA_WIDTH),
    height: Math.max(600, arenaOptions?.height ?? DEFAULT_ARENA_HEIGHT),
    ...(arenaOptions?.attackerPosition ? { attackerPosition: arenaOptions.attackerPosition } : {}),
    ...(arenaOptions?.defenderPosition ? { defenderPosition: arenaOptions.defenderPosition } : {}),
    ...(arenaOptions?.obstacles ? { obstacles: arenaOptions.obstacles } : {}),
  };
  const attacker = createCombatant(attackerSetup, 'attacker', arena);
  const defender = createCombatant(defenderSetup, 'defender', arena);
  const random = createRng(seed);
  const projectiles: MutableProjectile[] = [];
  const beams: MutableBeam[] = [];
  const mines: MutableMine[] = [];
  let elapsedSeconds = 0;
  let winner: StrategicCombatSide | null = null;
  let lastEvent = 'Kampfkontakt hergestellt';
  let projectileSerial = 0;
  let beamSerial = 0;
  let mineSerial = 0;
  let impactSerial = 0;
  let lastImpact: CombatImpactSnapshot | null = null;

  function combatantFor(side: StrategicCombatSide): MutableCombatant {
    return side === 'attacker' ? attacker : defender;
  }

  function enemyFor(side: StrategicCombatSide): MutableCombatant {
    return side === 'attacker' ? defender : attacker;
  }

  function noteImpact(
    target: StrategicCombatSide,
    layer: CombatImpactLayer,
    damage: number,
    point: CombatPoint
  ): void {
    impactSerial += 1;
    lastImpact = {
      serial: impactSerial,
      target,
      layer,
      damage,
      position: { ...point },
    };
  }

  function addBeam(
    side: StrategicCombatSide,
    kind: CombatBeamKind,
    family: ShipWeaponFamily,
    origin: CombatPoint,
    end: CombatPoint,
    weaponIndex: number
  ): void {
    beamSerial += 1;
    const maxTtlSeconds = kind === 'laser' ? 0.16 : 0.09;
    beams.push({
      id: beamSerial,
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

  function fireInstantWeapon(
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
    const targetPoint = hit
      ? target.position
      : {
          x: target.position.x + Math.cos(target.headingRadians + Math.PI / 2) * 85,
          y: target.position.y + Math.sin(target.headingRadians + Math.PI / 2) * 85,
        };
    const obstacle = firstObstacleHit(source.position, targetPoint, arena.obstacles ?? []);
    if (obstacle) {
      addBeam(side, kind, weapon.weapon.family, source.position, obstacle.point, weaponIndex);
      noteImpact(side === 'attacker' ? 'defender' : 'attacker', 'obstacle', 0, obstacle.point);
      return source.setup.name + ': ' + weapon.name + ' trifft Hindernis';
    }

    addBeam(side, kind, weapon.weapon.family, source.position, targetPoint, weaponIndex);
    if (!hit) {
      noteImpact(side === 'attacker' ? 'defender' : 'attacker', 'miss', 0, targetPoint);
      return source.setup.name + ': ' + weapon.name + ' verfehlt';
    }

    impactSerial += 1;
    const result = applyDamage(
      target,
      weapon.weapon.shieldDamage,
      weapon.weapon.hullDamage,
      source,
      critical,
      source.position,
      kind === 'laser' ? 'laser' : 'laser',
      impactSerial
    );
    const targetSide: StrategicCombatSide = side === 'attacker' ? 'defender' : 'attacker';
    lastImpact = {
      serial: impactSerial,
      target: targetSide,
      layer: result.layer,
      damage: result.damage,
      position: { ...target.position },
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

  function fireProjectileWeapon(
    side: StrategicCombatSide,
    source: MutableCombatant,
    target: MutableCombatant,
    weapon: ShipComponentDefinition,
    kind: CombatProjectileKind,
    hit: boolean,
    critical: boolean
  ): string {
    if (!weapon.weapon) return '';
    projectileSerial += 1;
    projectiles.push({
      id: projectileSerial,
      owner: side,
      kind,
      family: weapon.weapon.family,
      position: { ...source.position },
      target: side === 'attacker' ? 'defender' : 'attacker',
      speed: projectileSpeed(kind),
      ttlSeconds: Math.max(0.4, distance(source.position, target.position) / projectileSpeed(kind) + 0.8),
      shieldDamage: hit ? weapon.weapon.shieldDamage : 0,
      hullDamage: hit ? weapon.weapon.hullDamage : 0,
      critical: hit && critical,
    });
    return source.setup.name + ': ' + weapon.name + ' abgefeuert' + (critical ? ' · KRITISCH' : '');
  }

  function fireWeapon(
    side: StrategicCombatSide,
    source: MutableCombatant,
    target: MutableCombatant,
    weapon: ShipComponentDefinition,
    weaponIndex: number
  ): string {
    if (!weapon.weapon) return '';
    const range = distance(source.position, target.position);
    if (range > weapon.weapon.rangeMeters) return '';

    const hitChance = clamp(source.setup.hitChance - target.setup.dodgeChance, 0.2, 0.98);
    const critical = random() < clamp(source.setup.criticalChance, 0, 0.5);
    const kind = weaponKind(weapon.weapon.family);
    const hit = random() <= hitChance;

    if (kind === 'laser' || kind === 'rail') {
      return fireInstantWeapon(side, source, target, weapon, weaponIndex, kind, hit, critical);
    }
    return fireProjectileWeapon(side, source, target, weapon, kind, hit, critical);
  }

  function advanceWeapons(
    side: StrategicCombatSide,
    source: MutableCombatant,
    target: MutableCombatant,
    deltaSeconds: number
  ): void {
    for (let index = 0; index < source.setup.weapons.length; index += 1) {
      source.cooldowns[index] = Math.max(0, (source.cooldowns[index] ?? 0) - deltaSeconds);
      if ((source.cooldowns[index] ?? 0) > 0 || target.hullHp <= 0) continue;
      const weapon = source.setup.weapons[index];
      if (!weapon?.weapon) continue;
      if (distance(source.position, target.position) > weapon.weapon.rangeMeters) continue;

      const event = fireWeapon(side, source, target, weapon, index);
      source.cooldowns[index] =
        weapon.weapon.cooldownSeconds * clamp(source.setup.cycleTimeMultiplier, 0.4, 2);
      if (event) lastEvent = event;
    }
  }

  function advanceProjectiles(deltaSeconds: number): void {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index]!;
      const source = combatantFor(projectile.owner);
      const target = enemyFor(projectile.owner);
      if (target.hullHp <= 0) {
        projectiles.splice(index, 1);
        continue;
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
      const obstacle = firstObstacleHit(projectile.position, next, arena.obstacles ?? []);
      if (obstacle) {
        noteImpact(
          projectile.owner === 'attacker' ? 'defender' : 'attacker',
          'obstacle',
          0,
          obstacle.point
        );
        lastEvent = source.setup.name + ': ' + projectile.family.replaceAll('_', ' ') + ' trifft Hindernis';
        projectiles.splice(index, 1);
        continue;
      }

      if (projectile.shieldDamage <= 0 && projectile.hullDamage <= 0) {
        projectile.position = next;
        if (projectile.ttlSeconds <= 0) projectiles.splice(index, 1);
        continue;
      }

      if (remaining <= Math.max(18, step) || projectile.ttlSeconds <= 0) {
        impactSerial += 1;
        const result = applyDamage(
          target,
          projectile.shieldDamage,
          projectile.hullDamage,
          source,
          projectile.critical,
          projectile.position,
          projectile.kind === 'missile' ? 'missile' : 'laser',
          impactSerial
        );
        const targetSide: StrategicCombatSide =
          projectile.owner === 'attacker' ? 'defender' : 'attacker';
        lastImpact = {
          serial: impactSerial,
          target: targetSide,
          layer: result.layer,
          damage: result.damage,
          position: { ...target.position },
        };
        lastEvent =
          source.setup.name +
          ': ' +
          projectile.family.replaceAll('_', ' ') +
          ' trifft ' +
          (result.layer === 'shield' ? 'Schild' : 'Hülle') +
          ' -' +
          Math.round(result.damage);
        projectiles.splice(index, 1);
        continue;
      }

      projectile.position = next;
    }
  }

  function chooseMine(source: MutableCombatant, target: MutableCombatant): ShipMineDefinition | null {
    if (source.mineStock.length === 0) return null;
    const preferredKind =
      target.shieldHp > 0
        ? 'ion'
        : distance(source.position, target.position) > 360
          ? 'hunter'
          : 'shaped_charge';
    return (
      source.mineStock.find((mine) => mine.kind === preferredKind) ??
      source.mineStock[0] ??
      null
    );
  }

  function maybeDropMine(
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

    const definition = chooseMine(source, target);
    if (!definition) return;
    const stockIndex = source.mineStock.findIndex((mine) => mine.id === definition.id);
    if (stockIndex >= 0) source.mineStock.splice(stockIndex, 1);

    mineSerial += 1;
    source.mineCooldown = MINE_DROP_COOLDOWN;
    mines.push({
      id: mineSerial,
      owner: side,
      position: { ...source.position },
      armedSeconds: 0.7,
      pursuitRemaining: definition.pursuitSeconds,
      definition,
    });
    lastEvent = source.setup.name + ': ' + definition.name + ' gelegt';
  }

  function advanceMines(deltaSeconds: number): void {
    for (let index = mines.length - 1; index >= 0; index -= 1) {
      const mine = mines[index]!;
      mine.armedSeconds = Math.max(0, mine.armedSeconds - deltaSeconds);
      const target = enemyFor(mine.owner);
      if (target.hullHp <= 0) {
        mines.splice(index, 1);
        continue;
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

      if (mine.armedSeconds > 0) continue;
      if (distance(mine.position, target.position) > mine.definition.triggerRadiusMeters) continue;

      impactSerial += 1;
      const source = combatantFor(mine.owner);
      const result = applyDamage(
        target,
        mine.definition.shieldDamage,
        mine.definition.hullDamage,
        source,
        false,
        mine.position,
        'missile',
        impactSerial
      );
      const targetSide: StrategicCombatSide = mine.owner === 'attacker' ? 'defender' : 'attacker';
      lastImpact = {
        serial: impactSerial,
        target: targetSide,
        layer: result.layer,
        damage: result.damage,
        position: { ...target.position },
      };
      lastEvent =
        source.setup.name +
        ': ' +
        mine.definition.name +
        ' detoniert · ' +
        (result.layer === 'shield' ? 'Schild' : 'Hülle') +
        ' -' +
        Math.round(result.damage);
      mines.splice(index, 1);
    }
  }

  function resolveWinner(): void {
    if (winner) return;
    if (defender.hullHp <= 0) {
      winner = 'attacker';
      lastEvent = attacker.setup.name + ' gewinnt das Gefecht';
      return;
    }
    if (attacker.hullHp <= 0) {
      winner = 'defender';
      lastEvent = defender.setup.name + ' gewinnt das Gefecht';
      return;
    }

    const separation = distance(attacker.position, defender.position);
    const fleeingAttacker =
      attacker.tactic === 'flee' &&
      (attacker.position.x <= EDGE_PADDING + 8 ||
        attacker.position.x >= arena.width - EDGE_PADDING - 8 ||
        attacker.position.y <= EDGE_PADDING + 8 ||
        attacker.position.y >= arena.height - EDGE_PADDING - 8) &&
      separation > 900;
    const fleeingDefender =
      defender.tactic === 'flee' &&
      (defender.position.x <= EDGE_PADDING + 8 ||
        defender.position.x >= arena.width - EDGE_PADDING - 8 ||
        defender.position.y <= EDGE_PADDING + 8 ||
        defender.position.y >= arena.height - EDGE_PADDING - 8) &&
      separation > 900;

    if (fleeingAttacker) {
      winner = 'defender';
      lastEvent = attacker.setup.name + ' entkommt aus dem Gefecht';
    } else if (fleeingDefender) {
      winner = 'attacker';
      lastEvent = defender.setup.name + ' entkommt aus dem Gefecht';
    }
  }

  const current = (): StrategicCombatSnapshot => ({
    attacker: snapshot(attacker),
    defender: snapshot(defender),
    elapsedSeconds,
    winner,
    lastEvent,
    projectiles: projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      kind: projectile.kind,
      family: projectile.family,
      position: { ...projectile.position },
      target: { ...enemyFor(projectile.owner).position },
      ttlSeconds: projectile.ttlSeconds,
    })),
    beams: beams.map((beam) => ({ ...beam, origin: { ...beam.origin }, end: { ...beam.end } })),
    mines: mines.map((mine) => ({
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
          : mineDetection(mine.definition, attacker, mine.position),
    })),
    lastImpact,
    arena: { width: arena.width, height: arena.height },
  });

  return {
    getSnapshot: current,

    setTactic(side, tactic) {
      combatantFor(side).tactic = tactic;
      lastEvent = combatantFor(side).setup.name + ': Taktik ' + tactic.toUpperCase();
    },

    tick(deltaSeconds) {
      if (winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current();
      const dt = Math.min(deltaSeconds, 0.08);
      elapsedSeconds += dt;

      attacker.shieldImpacts = advanceShieldImpacts(attacker.shieldImpacts, dt);
      defender.shieldImpacts = advanceShieldImpacts(defender.shieldImpacts, dt);
      for (let index = beams.length - 1; index >= 0; index -= 1) {
        beams[index]!.ttlSeconds -= dt;
        if (beams[index]!.ttlSeconds <= 0) beams.splice(index, 1);
      }

      updateAiTactic(attacker, defender, elapsedSeconds);
      updateAiTactic(defender, attacker, elapsedSeconds);
      moveCombatant(attacker, defender, 'attacker', dt, arena, mines);
      moveCombatant(defender, attacker, 'defender', dt, arena, mines);
      resolveCombatantCollision(attacker, defender);
      resolveArenaObstacles(attacker, arena);
      resolveArenaObstacles(defender, arena);
      maybeDropMine('attacker', attacker, defender, dt);
      maybeDropMine('defender', defender, attacker, dt);
      advanceWeapons('attacker', attacker, defender, dt);
      advanceWeapons('defender', defender, attacker, dt);
      advanceProjectiles(dt);
      advanceMines(dt);
      resolveWinner();
      return current();
    },
  };
}
