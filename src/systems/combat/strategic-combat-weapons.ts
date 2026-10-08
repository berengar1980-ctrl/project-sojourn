import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';

import type {
  StrategicCombatRuntime,
  StrategicCombatSide,
  MutableCombatant,
  CombatBeamKind,
  CombatProjectileKind,
  MutableProjectile,
  ShieldSegmentHit,
} from './strategic-combat-types';

import {
  combatShieldGeometry,
  combatShieldCenter,
  segmentShieldHit,
  firstObstacleHit,
  applyDamage,
  projectileSpeed,
} from './strategic-combat-damage';

import {
  addRuntimeBeam,
  noteRuntimeImpact,
  runtimeCombatant,
  runtimeEnemy,
} from './strategic-combat-runtime';

import { distance, clamp, weaponKind, normalize } from './strategic-combat-geometry';

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

export function advanceRuntimeWeapons(
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
  shieldHit?: ShieldSegmentHit
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

export function advanceRuntimeProjectiles(
  runtime: StrategicCombatRuntime,
  deltaSeconds: number
): void {
  for (let index = runtime.projectiles.length - 1; index >= 0; index -= 1) {
    advanceRuntimeProjectile(runtime, runtime.projectiles[index]!, index, deltaSeconds);
  }
}
