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
import {
  consumeFireControl,
  rechargeFireControl,
  fireControlReady,
} from './combat-weapon-fire-control';
import { weaponInArc, weaponMuzzle } from './combat-weapon-geometry';
import {
  effectiveTargetSubsystem,
  engineShotAvailable,
  canEngagePreferredSubsystem,
} from './combat-subsystem-targeting';

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
  const muzzle = weaponMuzzle(source, weaponIndex);
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
  const shieldHit = hit ? segmentShieldHit(muzzle, targetPoint, target) : null;
  const beamEnd = shieldHit?.point ?? targetPoint;
  const obstacle = firstObstacleHit(muzzle, beamEnd, runtime.arena.obstacles ?? []);
  const targetSide: StrategicCombatSide = side === 'attacker' ? 'defender' : 'attacker';

  if (obstacle) {
    addRuntimeBeam(runtime, side, kind, weapon.weapon.family, muzzle, obstacle.point, weaponIndex);
    noteRuntimeImpact(runtime, targetSide, 'obstacle', 0, obstacle.point);
    return source.setup.name + ': ' + weapon.name + ' trifft Hindernis';
  }

  addRuntimeBeam(runtime, side, kind, weapon.weapon.family, muzzle, beamEnd, weaponIndex);
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
    muzzle,
    'laser',
    runtime.impactSerial,
    shieldHit ?? undefined,
    effectiveTargetSubsystem(source, target)
  );
  runtime.lastImpact = {
    serial: runtime.impactSerial,
    target: targetSide,
    layer: result.layer,
    ...(result.subsystem ? { subsystem: result.subsystem } : {}),
    damage: result.damage,
    position: { ...result.point },
  };
  return (
    source.setup.name +
    ': ' +
    weapon.name +
    ' trifft ' +
    (result.layer === 'shield'
      ? 'Schild'
      : result.subsystem === 'engine'
        ? 'Triebwerk'
        : result.subsystem === 'tractor'
          ? 'Traktorstrahl'
          : 'Hülle') +
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
  weaponIndex: number,
  kind: CombatProjectileKind,
  hit: boolean,
  critical: boolean
): string {
  if (!weapon.weapon) return '';
  const muzzle = weaponMuzzle(source, weaponIndex);
  const targetPoint = hit
    ? target.position
    : {
        x: target.position.x + Math.cos(target.headingRadians + Math.PI / 2) * 170,
        y: target.position.y + Math.sin(target.headingRadians + Math.PI / 2) * 170,
      };
  runtime.projectileSerial += 1;
  runtime.projectiles.push({
    id: runtime.projectileSerial,
    owner: side,
    kind,
    family: weapon.weapon.family,
    position: muzzle,
    direction: normalize(targetPoint.x - muzzle.x, targetPoint.y - muzzle.y),
    target: side === 'attacker' ? 'defender' : 'attacker',
    speed: projectileSpeed(kind),
    ttlSeconds: Math.max(
      0.4,
      distance(source.position, target.position) / projectileSpeed(kind) + 0.8
    ),
    shieldDamage: hit ? weapon.weapon.shieldDamage : 0,
    hullDamage: hit ? weapon.weapon.hullDamage : 0,
    critical: hit && critical,
    targetSubsystem: effectiveTargetSubsystem(source, target),
    missed: !hit,
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
  return fireRuntimeProjectileWeapon(
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

export function shouldReserveRailgun(
  source: MutableCombatant,
  target: MutableCombatant,
  railRange: number
): boolean {
  if (target.shieldHp > 0 || target.tactic !== 'flee' || source.tactic === 'flee') return false;
  if (target.subsystems?.engine > 0 && engineShotAvailable(source, target)) return false;
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
  const range = Math.hypot(dx, dy);
  if (range < 1 || range >= railRange * 0.85) return false;
  const separatingSpeed =
    ((target.velocity.x - source.velocity.x) * dx + (target.velocity.y - source.velocity.y) * dy) /
    range;
  if (separatingSpeed <= 5) return false;
  return source.setup.weapons.some(({ weapon }) =>
    Boolean(
      weapon &&
      weapon.mount !== 'forward' &&
      weapon.rangeMeters < railRange * 0.85 &&
      weapon.rangeMeters >= range
    )
  );
}

export function advanceRuntimeWeapons(
  runtime: StrategicCombatRuntime,
  side: StrategicCombatSide,
  source: MutableCombatant,
  target: MutableCombatant,
  deltaSeconds: number
): void {
  const now = runtime.elapsedSeconds;
  rechargeFireControl(source, now);
  for (let index = 0; index < source.setup.weapons.length; index += 1) {
    source.cooldowns[index] = Math.max(0, (source.cooldowns[index] ?? 0) - deltaSeconds);
  }
  if (target.hullHp <= 0 || !fireControlReady(source.fireControl, now)) return;

  // The current target layer determines weapon priority. A heavy gun cannot
  // fire through the opposite side of the hull simply because it is loaded.
  const candidates = source.setup.weapons
    .map((weapon, index) => ({ weapon, index }))
    .filter(({ weapon, index }) =>
      Boolean(
        weapon?.weapon &&
        (source.cooldowns[index] ?? 0) <= 0 &&
        distance(source.position, target.position) <= weapon.weapon.rangeMeters &&
        canEngagePreferredSubsystem(source, target) &&
        weaponInArc(source, target.position, index, weapon.weapon) &&
        !(
          weapon.weapon.family === 'railgun' &&
          shouldReserveRailgun(source, target, weapon.weapon.rangeMeters)
        )
      )
    )
    .sort((a, b) => {
      const score = (weapon: ShipComponentDefinition): number =>
        target.shieldHp > 0 ? (weapon.weapon?.shieldDamage ?? 0) : (weapon.weapon?.hullDamage ?? 0);
      return score(b.weapon) - score(a.weapon);
    });
  const candidate = candidates[0];
  if (!candidate || !consumeFireControl(source, now)) return;
  const event = fireRuntimeWeapon(runtime, side, source, target, candidate.weapon, candidate.index);
  source.cooldowns[candidate.index] =
    (candidate.weapon.weapon?.cooldownSeconds ?? 1) *
    clamp(source.setup.cycleTimeMultiplier, 0.4, 2);
  if (event) runtime.lastEvent = event;
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
    shieldHit,
    projectile.targetSubsystem === 'engine' && !engineShotAvailable(projectile, target)
      ? 'hull'
      : (projectile.targetSubsystem ?? 'hull')
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
  const step = projectile.speed * deltaSeconds;
  projectile.ttlSeconds -= deltaSeconds;
  if (projectile.kind === 'missile' && !projectile.missed) {
    const desired = Math.atan2(dy, dx);
    const current = Math.atan2(projectile.direction.y, projectile.direction.x);
    const error = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    const turn = clamp(error, -2.8 * deltaSeconds, 2.8 * deltaSeconds);
    projectile.direction = { x: Math.cos(current + turn), y: Math.sin(current + turn) };
  }
  // Plasma bolts and autocannon slugs retain their launch vector.
  const next = {
    x: projectile.position.x + projectile.direction.x * step,
    y: projectile.position.y + projectile.direction.y * step,
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
  const segmentX = next.x - projectile.position.x;
  const segmentY = next.y - projectile.position.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const fraction = clamp(
    ((target.position.x - projectile.position.x) * segmentX +
      (target.position.y - projectile.position.y) * segmentY) /
      Math.max(0.001, lengthSquared),
    0,
    1
  );
  const closest = {
    x: projectile.position.x + fraction * segmentX,
    y: projectile.position.y + fraction * segmentY,
  };
  const hitRadius = Math.max(28, Math.min(45, combatShieldGeometry(target).radiusY));
  if (distance(closest, target.position) <= hitRadius) {
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
  if (projectile.ttlSeconds <= 0) runtime.projectiles.splice(index, 1);
}

export function advanceRuntimeProjectiles(
  runtime: StrategicCombatRuntime,
  deltaSeconds: number
): void {
  for (let index = runtime.projectiles.length - 1; index >= 0; index -= 1) {
    advanceRuntimeProjectile(runtime, runtime.projectiles[index]!, index, deltaSeconds);
  }
}
