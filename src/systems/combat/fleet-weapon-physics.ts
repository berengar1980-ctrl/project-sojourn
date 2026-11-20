import type { ShipWeaponFamily } from '../../core/ship-types';
import { WEAPON_VISUALS } from '../../core/weapon-visual-profiles';
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
  shieldDamage: number;
  hullDamage: number;
  readonly critical: boolean;
  readonly subsystem: 'hull' | 'engine' | 'tractor';
  readonly origin: CombatPoint;
}
interface PendingBeam extends FleetWeaponBeam {
  ttlSeconds: number;
}

interface FleetPhysicsState {
  readonly arena: StrategicCombatArenaOptions;
  readonly random: () => number;
  readonly pending: PendingProjectile[];
  readonly beams: PendingBeam[];
  projectileSerial: number;
  beamSerial: number;
  impactSerial: number;
}

function applyFleetHit(
  state: FleetPhysicsState,
  source: MutableCombatant,
  target: MutableCombatant,
  weaponId: string,
  index: number,
  origin: CombatPoint,
  shieldDamage: number,
  hullDamage: number,
  critical: boolean,
  subsystem: 'hull' | 'engine' | 'tractor',
  shieldHit?: ReturnType<typeof segmentShieldHit>,
  sourceKind: 'laser' | 'missile' = 'laser'
): FleetWeaponHit | null {
  const previousShield = target.shieldHp;
  const previousHull = target.hullHp;
  const result = applyDamage(
    target, shieldDamage, hullDamage, source, critical, origin, sourceKind,
    ++state.impactSerial, shieldHit ?? undefined,
    subsystem === 'engine' && !engineShotAvailable(source, target) ? 'hull' : subsystem
  );
  recordWeaponDamage(source, index, result.layer, result.damage, result.subsystem);
  const dealtShield = Math.max(0, previousShield - target.shieldHp);
  const dealtHull = Math.max(0, previousHull - target.hullHp);
  if (!dealtShield && !dealtHull) return null;
  return {
    sourceId: source.setup.id, targetId: target.setup.id,
    origin: { ...origin }, destination: { ...result.point },
    weaponId, shieldDamage: dealtShield, hullDamage: dealtHull,
  };
}

interface FleetLaunch {
  readonly source: MutableCombatant;
  readonly target: MutableCombatant;
  readonly index: number;
  readonly component: NonNullable<MutableCombatant['setup']['weapons'][number]>;
  readonly muzzle: CombatPoint;
  readonly hit: boolean;
  readonly critical: boolean;
  readonly subsystem: 'hull' | 'engine' | 'tractor';
}

function fireFleetBeam(
  state: FleetPhysicsState,
  launch: FleetLaunch,
  hits: FleetWeaponHit[]
): void {
  const { source, target, index, component, muzzle, hit, critical, subsystem } = launch;
  const weapon = component.weapon!;
  const kind = weaponKind(weapon.family);
  if (kind !== 'laser' && kind !== 'rail') return;
  const aim = target.shieldHp > 0 ? combatShieldCenter(target) : target.position;
  const end = hit ? aim : missedShotEnd(muzzle, aim);
  const shieldHit = hit ? segmentShieldHit(muzzle, end, target) : null;
  const beamEnd = shieldHit?.point ?? end;
  const obstacle = firstObstacleHit(
    muzzle, beamEnd, state.arena.obstacles ?? [], state.arena.asteroids
  );
  state.beams.push({
    id: ++state.beamSerial, sourceId: source.setup.id, targetId: target.setup.id,
    kind, family: weapon.family, origin: { ...muzzle },
    end: { ...(obstacle?.point ?? beamEnd) },
    ttlSeconds: WEAPON_VISUALS[weapon.family].beamSeconds ?? (kind === 'laser' ? 0.16 : 0.09),
  });
  if (!hit || obstacle) return;
  const dealt = applyFleetHit(
    state, source, target, component.id, index, muzzle,
    nativeWeaponDamage(component).shieldDamage, nativeWeaponDamage(component).hullDamage,
    critical, subsystem, shieldHit
  );
  if (dealt) hits.push(dealt);
}

function fireFleetProjectile(state: FleetPhysicsState, launch: FleetLaunch): void {
  const { source, target, index, component, muzzle, hit, critical, subsystem } = launch;
  const weapon = component.weapon!;
  const kind = weaponKind(weapon.family);
  if (kind === 'laser' || kind === 'rail') return;
  const speed = projectileSpeed(kind);
  const aim = kind === 'missile'
    ? target.position
    : ballisticInterceptPoint(muzzle, target.position, target.velocity, speed);
  const endpoint = hit ? aim : missedShotEnd(muzzle, aim);
  const damage = nativeWeaponDamage(component);
  state.pending.push({
    id: ++state.projectileSerial, sourceId: source.setup.id, targetId: target.setup.id,
    kind, family: weapon.family, position: { ...muzzle }, origin: { ...muzzle },
    direction: normalize(endpoint.x - muzzle.x, endpoint.y - muzzle.y),
    ttlSeconds: Math.max(0.4, distance(muzzle, endpoint) / speed + 0.8),
    missed: !hit, weaponIndex: index, weaponId: component.id, speed,
    shieldDamage: hit ? damage.shieldDamage : 0,
    hullDamage: hit ? damage.hullDamage : 0, critical: hit && critical, subsystem,
  });
}

function fireFleetWeapon(
  state: FleetPhysicsState,
  source: MutableCombatant,
  target: MutableCombatant,
  index: number,
  hits: FleetWeaponHit[]
): void {
  const component = source.setup.weapons[index];
  if (!component?.weapon) return;
  const launch: FleetLaunch = {
    source, target, index, component, muzzle: weaponMuzzle(source, index),
    critical: state.random() < clamp(source.setup.criticalChance, 0, 0.5),
    hit: state.random() <= clamp(source.setup.hitChance - target.setup.dodgeChance, 0.2, 0.98),
    subsystem: effectiveTargetSubsystem(source, target),
  };
  const kind = weaponKind(component.weapon.family);
  if (kind === 'laser' || kind === 'rail') fireFleetBeam(state, launch, hits);
  else fireFleetProjectile(state, launch);
}

function steerFleetMissile(
  projectile: PendingProjectile, target: MutableCombatant, dt: number
): void {
  if (projectile.kind !== 'missile' || projectile.missed) return;
  const desired = Math.atan2(
    target.position.y - projectile.position.y, target.position.x - projectile.position.x
  );
  const current = Math.atan2(projectile.direction.y, projectile.direction.x);
  const error = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const turn = clamp(error, -0.85 * dt, 0.85 * dt);
  projectile.direction = { x: Math.cos(current + turn), y: Math.sin(current + turn) };
}

function resolveFleetProjectileContact(
  state: FleetPhysicsState,
  projectile: PendingProjectile,
  source: MutableCombatant,
  target: MutableCombatant,
  next: CombatPoint,
  hits: FleetWeaponHit[]
): boolean {
  const harmful = projectile.shieldDamage > 0 || projectile.hullDamage > 0;
  const shieldHit = harmful ? segmentShieldHit(projectile.position, next, target) : null;
  const obstacle = firstObstacleHit(
    projectile.position, next, state.arena.obstacles ?? [], state.arena.asteroids
  );
  if (obstacle && (!shieldHit || obstacle.t < shieldHit.t)) return true;
  if (!harmful) return false;
  let contact = shieldHit;
  if (!contact) {
    const sx = next.x - projectile.position.x;
    const sy = next.y - projectile.position.y;
    const t = clamp(
      ((target.position.x - projectile.position.x) * sx +
        (target.position.y - projectile.position.y) * sy) /
        Math.max(0.001, sx * sx + sy * sy), 0, 1
    );
    const closest = { x: projectile.position.x + t * sx, y: projectile.position.y + t * sy };
    const radius = Math.max(28, Math.min(45, combatShieldGeometry(target).radiusY));
    if (distance(closest, target.position) > radius) return false;
  }
  const dealt = applyFleetHit(
    state, source, target, projectile.weaponId, projectile.weaponIndex,
    projectile.position, projectile.shieldDamage, projectile.hullDamage,
    projectile.critical, projectile.subsystem, contact ?? undefined,
    projectile.kind === 'missile' ? 'missile' : 'laser'
  );
  if (dealt) hits.push(dealt);
  return true;
}

function advanceFleetProjectile(
  state: FleetPhysicsState,
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
  steerFleetMissile(projectile, target, dt);
  const next = {
    x: projectile.position.x + projectile.direction.x * projectile.speed * dt,
    y: projectile.position.y + projectile.direction.y * projectile.speed * dt,
  };
  projectile.ttlSeconds -= dt;
  if (resolveFleetProjectileContact(state, projectile, source, target, next, hits)) return false;
  projectile.position = next;
  if (projectile.kind === 'missile' && !projectile.missed &&
      dx * projectile.direction.x + dy * projectile.direction.y < -55) {
    projectile.missed = true;
    projectile.shieldDamage = 0;
    projectile.hullDamage = 0;
    projectile.ttlSeconds = Math.min(projectile.ttlSeconds, 0.65);
  }
  return projectile.ttlSeconds > 0;
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
  const state: FleetPhysicsState = {
    arena, random, pending: [], beams: [],
    projectileSerial: 0, beamSerial: 0, impactSerial: 0,
  };

  return {
    tick(dt, now, ships, targetFor) {
      const hits: FleetWeaponHit[] = [];
      const byId = new Map(ships.map((ship) => [ship.setup.id, ship]));
      for (let index = state.beams.length - 1; index >= 0; index--) {
        state.beams[index]!.ttlSeconds -= dt;
        if (state.beams[index]!.ttlSeconds <= 0) state.beams.splice(index, 1);
      }
      // Fired rounds already in flight are resolved before launching new volleys.
      for (let index = state.pending.length - 1; index >= 0; index--) {
        if (!advanceFleetProjectile(state, state.pending[index]!, dt, byId, hits)) state.pending.splice(index, 1);
      }
      for (const source of ships) {
        advanceWeaponCooldowns(source, dt);
        if (source.hullHp <= 0 || source.tactic === 'flee' || source.powerFault) continue;
        const target = targetFor(source);
        if (!target || target.hullHp <= 0) continue;
        const candidates = source.setup.weapons
          .map((component, index) => ({ component, index }))
          .filter(({ component, index }) =>
            Boolean(
              component?.weapon &&
              (source.cooldowns[index] ?? 0) <= FIRE_CONTROL_LOOKAHEAD_SECONDS &&
              distance(source.position, target.position) <= component.weapon.rangeMeters &&
              weaponInArc(source, target.position, index, component.weapon) &&
              hasClearCombatShot(source, target, index, arena)
            )
          );
        const volley = selectFireControlVolley(source, target, candidates, now);
        const launched: number[] = [];
        for (const index of volley) {
          if (target.hullHp <= 0) break;
          const component = source.setup.weapons[index]!;
          if (!component.weapon) continue;
          fireFleetWeapon(state, source, target, index, hits);
          source.cooldowns[index] = weaponCycleSeconds(
            component.weapon,
            source.setup.cycleTimeMultiplier
          );
          recordWeaponFired(source, index, now);
          launched.push(index);
        }
        if (launched.length) commitFireControlVolley(source, now, launched);
      }
      return hits;
    },
    projectiles: () =>
      state.pending.map(
        ({ id, sourceId, targetId, kind, family, position, direction, ttlSeconds, missed }) => ({
          id,
          sourceId,
          targetId,
          kind,
          family,
          position: { ...position },
          direction: { ...direction },
          ttlSeconds,
          missed,
        })
      ),
    beams: () =>
      state.beams.map(({ id, sourceId, targetId, kind, family, origin, end, ttlSeconds }) => ({
        id,
        sourceId,
        targetId,
        kind,
        family,
        origin: { ...origin },
        end: { ...end },
        ttlSeconds,
      })),
  };
}
