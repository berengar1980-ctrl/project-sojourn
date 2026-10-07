import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import type { ShipWeaponFamily } from '../../core/ship-types';

export type StrategicCombatSide = 'attacker' | 'defender';
export type CombatTactic = 'fight' | 'kite' | 'flee' | 'minefield';
export type CombatImpactLayer = 'shield' | 'hull' | 'miss';
export type CombatProjectileKind = 'laser' | 'plasma' | 'missile' | 'rail' | 'autocannon';

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
  readonly mineCharges?: number;
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
  readonly tactic: CombatTactic;
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

export interface CombatMineSnapshot {
  readonly id: number;
  readonly owner: StrategicCombatSide;
  readonly position: CombatPoint;
  readonly armed: boolean;
  readonly radius: number;
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
  readonly mines: readonly CombatMineSnapshot[];
  readonly lastImpact: CombatImpactSnapshot | null;
  readonly arena: {
    readonly width: number;
    readonly height: number;
  };
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
  tactic: CombatTactic;
  shieldHp: number;
  hullHp: number;
  mineCharges: number;
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

interface MutableMine {
  id: number;
  owner: StrategicCombatSide;
  position: { x: number; y: number };
  armedSeconds: number;
  radius: number;
  shieldDamage: number;
  hullDamage: number;
}

const ARENA_WIDTH = 2600;
const ARENA_HEIGHT = 1600;
const EDGE_PADDING = 140;
const MINE_DROP_COOLDOWN = 7.5;
const MINE_TRIGGER_RADIUS = 125;
const MINE_DAMAGE = 34;

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

function createCombatant(
  setup: StrategicCombatantSetup,
  side: StrategicCombatSide
): MutableCombatant {
  const startX = side === 'attacker' ? ARENA_WIDTH * 0.28 : ARENA_WIDTH * 0.72;
  const startY = ARENA_HEIGHT * (side === 'attacker' ? 0.46 : 0.54);
  return {
    setup,
    shieldMaxHp: Math.max(0, setup.shieldHp),
    hullMaxHp: Math.max(1, setup.hullHp),
    shieldHp: Math.max(0, setup.shieldHp),
    hullHp: Math.max(1, setup.hullHp),
    cooldowns: setup.weapons.map(() => 0),
    position: { x: startX, y: startY },
    headingRadians: side === 'attacker' ? 0 : Math.PI,
    speed: 0,
    tactic: setup.preferredTactic ?? 'fight',
    mineCharges: Math.max(0, Math.floor(setup.mineCharges ?? 0)),
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
    tactic: combatant.tactic,
  };
}

function weaponKind(family: ShipWeaponFamily): CombatProjectileKind {
  if (family === 'guided_missile' || family === 'he_missile') return 'missile';
  if (family === 'plasma_battery') return 'plasma';
  if (family === 'railgun') return 'rail';
  if (family === 'autocannon') return 'autocannon';
  return 'laser';
}

function preferredRange(combatant: MutableCombatant): number {
  const ranges = combatant.setup.weapons
    .flatMap((weapon) => (weapon.weapon ? [weapon.weapon.rangeMeters] : []));
  if (ranges.length === 0) return 260;
  const max = Math.max(...ranges);
  const min = Math.min(...ranges);
  if (combatant.tactic === 'kite') return Math.max(380, max * 0.82);
  if (combatant.tactic === 'minefield') return Math.max(320, min * 0.72);
  return Math.max(220, min * 0.64);
}

function moveCombatant(
  combatant: MutableCombatant,
  enemy: MutableCombatant,
  side: StrategicCombatSide,
  deltaSeconds: number
): void {
  if (combatant.hullHp <= 0) {
    combatant.speed = 0;
    return;
  }

  const dx = enemy.position.x - combatant.position.x;
  const dy = enemy.position.y - combatant.position.y;
  const range = Math.max(1, Math.hypot(dx, dy));
  const toward = normalize(dx, dy);
  const perpendicular = side === 'attacker'
    ? { x: -toward.y, y: toward.x }
    : { x: toward.y, y: -toward.x };
  const desired = preferredRange(combatant);

  let direction = toward;
  if (combatant.tactic === 'flee') {
    direction = { x: -toward.x, y: -toward.y };
  } else if (range < desired * 0.75) {
    direction = normalize(-toward.x + perpendicular.x * 0.55, -toward.y + perpendicular.y * 0.55);
  } else if (range <= desired * 1.25) {
    direction = normalize(perpendicular.x, perpendicular.y);
  } else if (combatant.tactic === 'kite' && range < desired * 1.45) {
    direction = normalize(-toward.x * 0.6 + perpendicular.x, -toward.y * 0.6 + perpendicular.y);
  }

  const baseSpeed = Math.max(70, combatant.setup.combatSpeed ?? 120);
  const speedMultiplier =
    combatant.tactic === 'flee' ? 1.18 : combatant.tactic === 'kite' ? 1.05 : 0.92;
  combatant.speed = baseSpeed * speedMultiplier;
  combatant.headingRadians = Math.atan2(direction.y, direction.x);
  combatant.position.x = clamp(
    combatant.position.x + direction.x * combatant.speed * deltaSeconds,
    EDGE_PADDING,
    ARENA_WIDTH - EDGE_PADDING
  );
  combatant.position.y = clamp(
    combatant.position.y + direction.y * combatant.speed * deltaSeconds,
    EDGE_PADDING,
    ARENA_HEIGHT - EDGE_PADDING
  );
}

function scaledDamage(raw: number, attacker: MutableCombatant, critical: boolean): number {
  const criticalMultiplier = critical ? 1.5 : 1;
  return Math.max(1, Math.round(raw * attacker.setup.damageMultiplier * criticalMultiplier));
}

function applyDamage(
  target: MutableCombatant,
  shieldDamage: number,
  hullDamage: number,
  attacker: MutableCombatant,
  critical: boolean
): { layer: CombatImpactLayer; damage: number } {
  if (target.shieldHp > 0) {
    const damage = Math.min(
      target.shieldHp,
      scaledDamage(shieldDamage, attacker, critical)
    );
    target.shieldHp = Math.max(0, target.shieldHp - damage);
    return { layer: 'shield', damage };
  }
  const damage = Math.min(
    target.hullHp,
    scaledDamage(hullDamage, attacker, critical)
  );
  target.hullHp = Math.max(0, target.hullHp - damage);
  return { layer: 'hull', damage };
}

function projectileSpeed(kind: CombatProjectileKind): number {
  if (kind === 'missile') return 430;
  if (kind === 'plasma') return 680;
  if (kind === 'autocannon') return 980;
  if (kind === 'rail') return 1500;
  return 2400;
}

export function createStrategicCombatService(
  attackerSetup: StrategicCombatantSetup,
  defenderSetup: StrategicCombatantSetup,
  seed = hashSeed(attackerSetup.id + ':' + defenderSetup.id)
): StrategicCombatService {
  const attacker = createCombatant(attackerSetup, 'attacker');
  const defender = createCombatant(defenderSetup, 'defender');
  const random = createRng(seed);
  const projectiles: MutableProjectile[] = [];
  const mines: MutableMine[] = [];
  let elapsedSeconds = 0;
  let winner: StrategicCombatSide | null = null;
  let lastEvent = 'Kampfkontakt hergestellt';
  let projectileSerial = 0;
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

  function fireWeapon(
    side: StrategicCombatSide,
    source: MutableCombatant,
    target: MutableCombatant,
    weapon: ShipComponentDefinition
  ): string {
    if (!weapon.weapon) return '';
    const range = distance(source.position, target.position);
    if (range > weapon.weapon.rangeMeters) return '';

    const hitChance = clamp(source.setup.hitChance - target.setup.dodgeChance, 0.2, 0.98);
    const critical = random() < clamp(source.setup.criticalChance, 0, 0.5);
    const kind = weaponKind(weapon.weapon.family);
    const hit = random() <= hitChance;

    if (!hit) {
      projectileSerial += 1;
      projectiles.push({
        id: projectileSerial,
        owner: side,
        kind,
        family: weapon.weapon.family,
        position: { ...source.position },
        target: side === 'attacker' ? 'defender' : 'attacker',
        speed: projectileSpeed(kind),
        ttlSeconds: Math.min(0.7, range / projectileSpeed(kind)),
        shieldDamage: 0,
        hullDamage: 0,
        critical: false,
      });
      noteImpact(side === 'attacker' ? 'defender' : 'attacker', 'miss', 0, target.position);
      return `${source.setup.name}: ${weapon.name} verfehlt`;
    }

    projectileSerial += 1;
    projectiles.push({
      id: projectileSerial,
      owner: side,
      kind,
      family: weapon.weapon.family,
      position: { ...source.position },
      target: side === 'attacker' ? 'defender' : 'attacker',
      speed: projectileSpeed(kind),
      ttlSeconds: Math.max(0.05, range / projectileSpeed(kind)),
      shieldDamage: weapon.weapon.shieldDamage,
      hullDamage: weapon.weapon.hullDamage,
      critical,
    });

    return `${source.setup.name}: ${weapon.name} abgefeuert${critical ? ' · KRITISCH' : ''}`;
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

      const event = fireWeapon(side, source, target, weapon);
      source.cooldowns[index] =
        weapon.weapon.cooldownSeconds * clamp(source.setup.cycleTimeMultiplier, 0.4, 2);
      if (event) lastEvent = event;
    }
  }

  function advanceProjectiles(deltaSeconds: number): void {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index]!;
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

      if (projectile.shieldDamage <= 0 && projectile.hullDamage <= 0) {
        const missDirection = normalize(dx, dy + 80);
        projectile.position.x += missDirection.x * step;
        projectile.position.y += missDirection.y * step;
        if (projectile.ttlSeconds <= 0) projectiles.splice(index, 1);
        continue;
      }

      if (remaining <= Math.max(12, step) || projectile.ttlSeconds <= 0) {
        const result = applyDamage(
          target,
          projectile.shieldDamage,
          projectile.hullDamage,
          combatantFor(projectile.owner),
          projectile.critical
        );
        const targetSide: StrategicCombatSide =
          projectile.owner === 'attacker' ? 'defender' : 'attacker';
        noteImpact(targetSide, result.layer, result.damage, target.position);
        lastEvent =
          `${combatantFor(projectile.owner).setup.name}: ` +
          `${projectile.family.replaceAll('_', ' ')} trifft ` +
          `${result.layer === 'shield' ? 'Schild' : 'Hülle'} -${result.damage}`;
        projectiles.splice(index, 1);
        continue;
      }

      const direction = normalize(dx, dy);
      projectile.position.x += direction.x * step;
      projectile.position.y += direction.y * step;
    }
  }

  function maybeDropMine(
    side: StrategicCombatSide,
    source: MutableCombatant,
    target: MutableCombatant,
    deltaSeconds: number
  ): void {
    source.mineCooldown = Math.max(0, source.mineCooldown - deltaSeconds);
    if (source.tactic !== 'minefield' || source.mineCharges <= 0 || source.mineCooldown > 0) return;
    if (distance(source.position, target.position) > 700) return;

    mineSerial += 1;
    source.mineCharges -= 1;
    source.mineCooldown = MINE_DROP_COOLDOWN;
    mines.push({
      id: mineSerial,
      owner: side,
      position: { ...source.position },
      armedSeconds: 0.7,
      radius: MINE_TRIGGER_RADIUS,
      shieldDamage: MINE_DAMAGE,
      hullDamage: MINE_DAMAGE,
    });
    lastEvent = source.setup.name + ': Mine gelegt';
  }

  function advanceMines(deltaSeconds: number): void {
    for (let index = mines.length - 1; index >= 0; index -= 1) {
      const mine = mines[index]!;
      mine.armedSeconds = Math.max(0, mine.armedSeconds - deltaSeconds);
      if (mine.armedSeconds > 0) continue;
      const target = enemyFor(mine.owner);
      if (target.hullHp <= 0) continue;
      if (distance(mine.position, target.position) > mine.radius) continue;

      const result = applyDamage(
        target,
        mine.shieldDamage,
        mine.hullDamage,
        combatantFor(mine.owner),
        false
      );
      const targetSide: StrategicCombatSide = mine.owner === 'attacker' ? 'defender' : 'attacker';
      noteImpact(targetSide, result.layer, result.damage, target.position);
      lastEvent =
        combatantFor(mine.owner).setup.name +
        ': Mine detoniert · ' +
        (result.layer === 'shield' ? 'Schild' : 'Hülle') +
        ' -' +
        result.damage;
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
        attacker.position.x >= ARENA_WIDTH - EDGE_PADDING - 8 ||
        attacker.position.y <= EDGE_PADDING + 8 ||
        attacker.position.y >= ARENA_HEIGHT - EDGE_PADDING - 8) &&
      separation > 900;
    const fleeingDefender =
      defender.tactic === 'flee' &&
      (defender.position.x <= EDGE_PADDING + 8 ||
        defender.position.x >= ARENA_WIDTH - EDGE_PADDING - 8 ||
        defender.position.y <= EDGE_PADDING + 8 ||
        defender.position.y >= ARENA_HEIGHT - EDGE_PADDING - 8) &&
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
    mines: mines.map((mine) => ({
      id: mine.id,
      owner: mine.owner,
      position: { ...mine.position },
      armed: mine.armedSeconds <= 0,
      radius: mine.radius,
    })),
    lastImpact,
    arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
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

      moveCombatant(attacker, defender, 'attacker', dt);
      moveCombatant(defender, attacker, 'defender', dt);
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
