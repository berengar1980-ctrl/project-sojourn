import type { ShipWeaponFamily } from '../../core/ship-types';
import type {
  CombatBeamKind,
  CombatPoint,
  CombatProjectileKind,
  MutableCombatant,
  StrategicCombatArenaOptions,
} from './strategic-combat-types';
import { clamp, distance, normalize, weaponKind } from './strategic-combat-geometry';
import {
  applyDamage,
  combatShieldCenter,
  combatShieldGeometry,
  firstObstacleHit,
  projectileSpeed,
  segmentShieldHit,
} from './strategic-combat-damage';
import { nativeWeaponDamage } from './combat-native-damage';
import { weaponInArc, weaponMuzzle } from './combat-weapon-geometry';
import { hasClearCombatShot } from './combat-line-of-sight';
import { ballisticInterceptPoint } from './combat-weapon-aim';
import { missedShotEnd } from './combat-miss-depth';
import {
  advanceWeaponCooldowns,
  commitFireControlVolley,
  FIRE_CONTROL_LOOKAHEAD_SECONDS,
  selectFireControlVolley,
  weaponCycleSeconds,
} from './combat-weapon-fire-control';
import { effectiveTargetSubsystem, engineShotAvailable } from './combat-subsystem-targeting';
import { recordWeaponDamage, recordWeaponFired } from './combat-weapon-telemetry';

export interface FleetWeaponHit {
  readonly sourceId: string;
  readonly targetId: string;
  readonly origin: CombatPoint;
  readonly destination: CombatPoint;
  readonly weaponId: string;
  readonly shieldDamage: number;
  readonly hullDamage: number;
}
export interface FleetWeaponProjectile {
  readonly id: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: CombatProjectileKind;
  readonly family: ShipWeaponFamily;
  readonly position: CombatPoint;
  readonly direction: CombatPoint;
  readonly ttlSeconds: number;
  readonly missed: boolean;
}
export interface FleetWeaponBeam {
  readonly id: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: CombatBeamKind;
  readonly family: ShipWeaponFamily;
  readonly origin: CombatPoint;
  readonly end: CombatPoint;
  readonly ttlSeconds: number;
}
interface PendingProjectile extends FleetWeaponProjectile {
  position: { x: number; y: number };
  direction: CombatPoint;
  ttlSeconds: number;
  missed: boolean;
  readonly weaponIndex: number;
  readonly weaponId: string;
  readonly speed: number;
  readonly shieldDamage: number;
  readonly hullDamage: number;
  readonly critical: boolean;
  readonly subsystem: 'hull' | 'engine' | 'tractor';
  readonly origin: CombatPoint;
}
interface PendingBeam extends FleetWeaponBeam {
  ttlSeconds: number;
}
/**
 * A multi-participant owner for the SAME physical weapons, fire-control, shields,
 * armor, collision raycasts and projectiles used by the campaign 1vs1 engine.
 * The duel's two-sided runtime and its protected source files are not modified.
 */
export function createFleetWeaponPhysics(
  arena: StrategicCombatArenaOptions,
  random: () => number
): {
  tick(
    dt: number,
    now: number,
    ships: readonly MutableCombatant[],
    targetFor: (ship: MutableCombatant) => MutableCombatant | null
  ): readonly FleetWeaponHit[];
  projectiles(): readonly FleetWeaponProjectile[];
  beams(): readonly FleetWeaponBeam[];
} {
  const pending: PendingProjectile[] = [];
  const activeBeams: PendingBeam[] = [];
  let projectileSerial = 0;
  let beamSerial = 0;
  let impactSerial = 0;

  function applyHit(
    source: MutableCombatant,
    target: MutableCombatant,
    weaponId: string,
    index: number,
    origin: CombatPoint,
    shieldDamage: number,
    hullDamage: number,
    critical: boolean,
    subsystem: 'hull' | 'engine' | 'tractor',
    shieldHit?: ReturnType<typeof segmentShieldHit>
  ): FleetWeaponHit | null {
    const previousShield = target.shieldHp;
    const previousHull = target.hullHp;
    impactSerial++;
    const result = applyDamage(
      target,
      shieldDamage,
      hullDamage,
      source,
      critical,
      origin,
      'laser',
      impactSerial,
      shieldHit ?? undefined,
      subsystem === 'engine' && !engineShotAvailable(source, target) ? 'hull' : subsystem
    );
    recordWeaponDamage(source, index, result.layer, result.damage, result.subsystem);
    const dealtShield = Math.max(0, previousShield - target.shieldHp);
    const dealtHull = Math.max(0, previousHull - target.hullHp);
    if (!dealtShield && !dealtHull) return null;
    return {
      sourceId: source.setup.id,
      targetId: target.setup.id,
      origin: { ...origin },
      destination: { ...result.point },
      weaponId,
      shieldDamage: dealtShield,
      hullDamage: dealtHull,
    };
  }

  function fire(
    source: MutableCombatant,
    target: MutableCombatant,
    index: number,
    hits: FleetWeaponHit[]
  ): void {
    const component = source.setup.weapons[index];
    const weapon = component?.weapon;
    if (!component || !weapon) return;
    const muzzle = weaponMuzzle(source, index);
    const kind = weaponKind(weapon.family);
    const hit = random() <= clamp(source.setup.hitChance - target.setup.dodgeChance, 0.2, 0.98);
    const critical = random() < clamp(source.setup.criticalChance, 0, 0.5);
    const damage = nativeWeaponDamage(component);
    const subsystem = effectiveTargetSubsystem(source, target);
    if (kind === 'laser' || kind === 'rail') {
      const aim = target.shieldHp > 0 ? combatShieldCenter(target) : target.position;
      const end = hit ? aim : missedShotEnd(muzzle, aim);
      const shieldHit = hit ? segmentShieldHit(muzzle, end, target) : null;
      const beamEnd = shieldHit?.point ?? end;
      const obstacle = firstObstacleHit(muzzle, beamEnd, arena.obstacles ?? [], arena.asteroids);
      activeBeams.push({
        id: ++beamSerial, sourceId: source.setup.id, targetId: target.setup.id,
        kind, family: weapon.family, origin: { ...muzzle },
        end: { ...(obstacle?.point ?? beamEnd) }, ttlSeconds: kind === 'laser' ? 0.16 : 0.09,
      });
      if (hit && !obstacle) {
        const dealt = applyHit(
          source, target, component.id, index, muzzle,
          damage.shieldDamage, damage.hullDamage, critical, subsystem, shieldHit
        );
        if (dealt) hits.push(dealt);
      }
      return;
    }
    const speed = projectileSpeed(kind);
    const aim = kind === 'missile'
      ? target.position
      : ballisticInterceptPoint(muzzle, target.position, target.velocity, speed);
    const endpoint = hit ? aim : missedShotEnd(muzzle, aim);
    pending.push({
      id: ++projectileSerial, sourceId: source.setup.id, targetId: target.setup.id,
      kind, family: weapon.family, position: { ...muzzle },
      origin: { ...muzzle }, direction: normalize(endpoint.x - muzzle.x, endpoint.y - muzzle.y),
      ttlSeconds: Math.max(0.4, distance(muzzle, endpoint) / speed + 0.8),
      missed: !hit, weaponIndex: index, weaponId: component.id, speed,
      shieldDamage: hit ? damage.shieldDamage : 0,
      hullDamage: hit ? damage.hullDamage : 0, critical: hit && critical, subsystem,
    });
  }

  function advanceProjectile(
    projectile: PendingProjectile,
    dt: number,
    shipsById: ReadonlyMap<string, MutableCombatant>,
    hits: FleetWeaponHit[]
  ): boolean {
    const source = shipsById.get(projectile.sourceId);
    const target = shipsById.get(projectile.targetId);
    if (!source || !target || target.hullHp <= 0) return false;
    const dx = target.position.x - projectile.position.x;
    const dy = target.position.y - projectile.position.y;
    if (projectile.kind === 'missile' && !projectile.missed) {
      const desired = Math.atan2(dy, dx);
      const current = Math.atan2(projectile.direction.y, projectile.direction.x);
      const error = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
      const turn = clamp(error, -0.85 * dt, 0.85 * dt);
      projectile.direction = { x: Math.cos(current + turn), y: Math.sin(current + turn) };
    }
    const next = {
      x: projectile.position.x + projectile.direction.x * projectile.speed * dt,
      y: projectile.position.y + projectile.direction.y * projectile.speed * dt,
    };
    projectile.ttlSeconds -= dt;
    const harmful = projectile.shieldDamage > 0 || projectile.hullDamage > 0;
    const shieldHit = harmful ? segmentShieldHit(projectile.position, next, target) : null;
    const obstacle = firstObstacleHit(
      projectile.position, next, arena.obstacles ?? [], arena.asteroids
    );
    if (obstacle && (!shieldHit || obstacle.t < shieldHit.t)) return false;
    if (harmful && shieldHit) {
      const dealt = applyHit(
        source, target, projectile.weaponId, projectile.weaponIndex,
        projectile.position, projectile.shieldDamage, projectile.hullDamage,
        projectile.critical, projectile.subsystem, shieldHit
      );
      if (dealt) hits.push(dealt);
      return false;
    }
    if (harmful) {
      const sx = next.x - projectile.position.x;
      const sy = next.y - projectile.position.y;
      const t = clamp(
        ((target.position.x - projectile.position.x) * sx +
          (target.position.y - projectile.position.y) * sy) /
          Math.max(0.001, sx * sx + sy * sy), 0, 1
      );
      const closest = { x: projectile.position.x + t * sx, y: projectile.position.y + t * sy };
      const radius = Math.max(28, Math.min(45, combatShieldGeometry(target).radiusY));
      if (distance(closest, target.position) <= radius) {
        const dealt = applyHit(
          source, target, projectile.weaponId, projectile.weaponIndex,
          projectile.position, projectile.shieldDamage, projectile.hullDamage,
          projectile.critical, projectile.subsystem
        );
        if (dealt) hits.push(dealt);
        return false;
      }
    }
    projectile.position = next;
    if (projectile.kind === 'missile' && !projectile.missed &&
        dx * projectile.direction.x + dy * projectile.direction.y < -55) {
      projectile.missed = true;
      projectile.ttlSeconds = Math.min(projectile.ttlSeconds, 0.65);
    }
    return projectile.ttlSeconds > 0;
  }

  return {
    tick(dt, now, ships, targetFor) {
      const hits: FleetWeaponHit[] = [];
      const byId = new Map(ships.map((ship) => [ship.setup.id, ship]));
      for (let index = activeBeams.length - 1; index >= 0; index--) {
        activeBeams[index]!.ttlSeconds -= dt;
        if (activeBeams[index]!.ttlSeconds <= 0) activeBeams.splice(index, 1);
      }
      // Fired rounds already in flight are resolved before launching new volleys.
      for (let index = pending.length - 1; index >= 0; index--) {
        if (!advanceProjectile(pending[index]!, dt, byId, hits)) pending.splice(index, 1);
      }
      for (const source of ships) {
        advanceWeaponCooldowns(source, dt);
        if (source.hullHp <= 0 || source.tactic === 'flee' || source.powerFault) continue;
        const target = targetFor(source);
        if (!target || target.hullHp <= 0) continue;
        const candidates = source.setup.weapons
          .map((component, index) => ({ component, index }))
          .filter(({ component, index }) =>
            Boolean(component?.weapon &&
              (source.cooldowns[index] ?? 0) <= FIRE_CONTROL_LOOKAHEAD_SECONDS &&
              distance(source.position, target.position) <= component.weapon.rangeMeters &&
              weaponInArc(source, target.position, index, component.weapon) &&
              hasClearCombatShot(source, target, index, arena))
          );
        const volley = selectFireControlVolley(source, target, candidates, now);
        const launched: number[] = [];
        for (const index of volley) {
          if (target.hullHp <= 0) break;
          const component = source.setup.weapons[index]!;
          if (!component.weapon) continue;
          fire(source, target, index, hits);
          source.cooldowns[index] = weaponCycleSeconds(
            component.weapon, source.setup.cycleTimeMultiplier
          );
          recordWeaponFired(source, index, now);
          launched.push(index);
        }
        if (launched.length) commitFireControlVolley(source, now, launched);
      }
      return hits;
    },
    projectiles: () => pending.map(({ id, sourceId, targetId, kind, family, position,
      direction, ttlSeconds, missed }) =>
      ({ id, sourceId, targetId, kind, family, position: { ...position },
        direction: { ...direction }, ttlSeconds, missed })),
    beams: () => activeBeams.map(({ id, sourceId, targetId, kind, family, origin,
      end, ttlSeconds }) =>
      ({ id, sourceId, targetId, kind, family, origin: { ...origin },
        end: { ...end }, ttlSeconds })),
  };
}
