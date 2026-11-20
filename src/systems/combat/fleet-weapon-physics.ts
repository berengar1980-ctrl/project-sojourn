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
import { firstFleetShipContact } from './fleet-physical-contacts';

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
  readonly source: MutableCombatant;
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
    target,
    shieldDamage,
    hullDamage,
    source,
    critical,
    origin,
    sourceKind,
    ++state.impactSerial,
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
  ships: readonly MutableCombatant[],
  hits: FleetWeaponHit[]
): void {
  const { source, target, index, component, muzzle, hit, critical, subsystem } = launch;
  const weapon = component.weapon!;
  const kind = weaponKind(weapon.family);
  if (kind !== 'laser' && kind !== 'rail') return;
  const aim = target.shieldHp > 0 ? combatShieldCenter(target) : target.position;
  const scatteredAim = hit ? aim : missedShotEnd(muzzle, aim);
  const direction = normalize(scatteredAim.x - muzzle.x, scatteredAim.y - muzzle.y);
  const end = {
    x: muzzle.x + direction.x * weapon.rangeMeters,
    y: muzzle.y + direction.y * weapon.rangeMeters,
  };
  const shipHit = firstFleetShipContact(muzzle, end, ships, source.setup.id);
  const obstacle = firstObstacleHit(muzzle, end, state.arena.obstacles ?? [], state.arena.asteroids);
  const physicalHit = shipHit && (!obstacle || shipHit.t < obstacle.t) ? shipHit : null;
  const beamEnd = physicalHit?.point ?? obstacle?.point ?? end;
  state.beams.push({
    id: ++state.beamSerial,
    sourceId: source.setup.id,
    targetId: target.setup.id,
    kind,
    family: weapon.family,
    origin: { ...muzzle },
    end: { ...beamEnd },
    ttlSeconds: WEAPON_VISUALS[weapon.family].beamSeconds ?? (kind === 'laser' ? 0.16 : 0.09),
  });
  if (!physicalHit) return;
  const damage = nativeWeaponDamage(component);
  const dealt = applyFleetHit(
    state, source, physicalHit.ship, component.id, index, muzzle,
    damage.shieldDamage, damage.hullDamage, critical,
    physicalHit.ship === target ? subsystem : 'hull',
    physicalHit.shieldHit
  );
  if (dealt) hits.push(dealt);
}

function fireFleetProjectile(state: FleetPhysicsState, launch: FleetLaunch): void {
  const { source, target, index, component, muzzle, hit, critical, subsystem } = launch;
  const weapon = component.weapon!;
  const kind = weaponKind(weapon.family);
  if (kind === 'laser' || kind === 'rail') return;
  const speed = projectileSpeed(kind);
  const aim =
    kind === 'missile'
      ? target.position
      : ballisticInterceptPoint(muzzle, target.position, target.velocity, speed);
  const endpoint = hit ? aim : missedShotEnd(muzzle, aim);
  const damage = nativeWeaponDamage(component);
  state.pending.push({
    id: ++state.projectileSerial,
    sourceId: source.setup.id,
    targetId: target.setup.id,
    kind,
    family: weapon.family,
    position: { ...muzzle },
    origin: { ...muzzle },
    direction: normalize(endpoint.x - muzzle.x, endpoint.y - muzzle.y),
    ttlSeconds: Math.max(0.4, distance(muzzle, endpoint) / speed + 0.8),
    missed: !hit,
    weaponIndex: index,
    weaponId: component.id,
    source,
    speed,
    shieldDamage: damage.shieldDamage,
    hullDamage: damage.hullDamage,
    critical: hit && critical,
    subsystem,
  });
}

function fireFleetWeapon(
  state: FleetPhysicsState,
  source: MutableCombatant,
  target: MutableCombatant,
  index: number,
  ships: readonly MutableCombatant[],
  hits: FleetWeaponHit[]
): void {
  const component = source.setup.weapons[index];
  if (!component?.weapon) return;
  const launch: FleetLaunch = {
    source,
    target,
    index,
    component,
    muzzle: weaponMuzzle(source, index),
    critical: state.random() < clamp(source.setup.criticalChance, 0, 0.5),
    hit: state.random() <= clamp(source.setup.hitChance - target.setup.dodgeChance, 0.2, 0.98),
    subsystem: effectiveTargetSubsystem(source, target),
  };
  const kind = weaponKind(component.weapon.family);
  if (kind === 'laser' || kind === 'rail') fireFleetBeam(state, launch, ships, hits);
  else fireFleetProjectile(state, launch);
}

function steerFleetMissile(
  projectile: PendingProjectile,
  target: MutableCombatant,
  dt: number
): void {
  if (projectile.kind !== 'missile' || projectile.missed) return;
  const desired = Math.atan2(
    target.position.y - projectile.position.y,
    target.position.x - projectile.position.x
  );
  const current = Math.atan2(projectile.direction.y, projectile.direction.x);
  const error = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const turn = clamp(error, -0.85 * dt, 0.85 * dt);
  projectile.direction = { x: Math.cos(current + turn), y: Math.sin(current + turn) };
}

function resolveFleetProjectileContact(
  state: FleetPhysicsState,
  projectile: PendingProjectile,
  next: CombatPoint,
  ships: readonly MutableCombatant[],
  hits: FleetWeaponHit[]
): boolean {
  const contact = firstFleetShipContact(
    projectile.position, next, ships, projectile.sourceId
  );
  const obstacle = firstObstacleHit(
    projectile.position, next, state.arena.obstacles ?? [], state.arena.asteroids
  );
  if (obstacle && (!contact || obstacle.t <= contact.t)) return true;
  if (!contact) return false;
  const dealt = applyFleetHit(
    state, projectile.source, contact.ship, projectile.weaponId, projectile.weaponIndex,
    projectile.position, projectile.shieldDamage, projectile.hullDamage,
    projectile.critical, contact.ship.setup.id === projectile.targetId
      ? projectile.subsystem : 'hull',
    contact.shieldHit ?? undefined,
    projectile.kind === 'missile' ? 'missile' : 'laser'
  );
  if (dealt) hits.push(dealt);
  return true;
}

function advanceFleetProjectile(
  state: FleetPhysicsState,
  projectile: PendingProjectile,
  dt: number,
  ships: readonly MutableCombatant[],
  hits: FleetWeaponHit[]
): boolean {
  const target = ships.find((ship) => ship.setup.id === projectile.targetId);
  if (target && target.hullHp > 0) steerFleetMissile(projectile, target, dt);
  const next = {
    x: projectile.position.x + projectile.direction.x * projectile.speed * dt,
    y: projectile.position.y + projectile.direction.y * projectile.speed * dt,
  };
  projectile.ttlSeconds -= dt;
  if (resolveFleetProjectileContact(state, projectile, next, ships, hits)) return false;
  projectile.position = next;
  if (target && target.hullHp > 0 && projectile.kind === 'missile' &&
      !projectile.missed &&
      (target.position.x - projectile.position.x) * projectile.direction.x +
      (target.position.y - projectile.position.y) * projectile.direction.y < -55) {
    projectile.missed = true;
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
    arena,
    random,
    pending: [],
    beams: [],
    projectileSerial: 0,
    beamSerial: 0,
    impactSerial: 0,
  };

  return {
    tick(dt, now, ships, targetFor) {
      const hits: FleetWeaponHit[] = [];
      for (let index = state.beams.length - 1; index >= 0; index--) {
        state.beams[index]!.ttlSeconds -= dt;
        if (state.beams[index]!.ttlSeconds <= 0) state.beams.splice(index, 1);
      }
      // Fired rounds already in flight are resolved before launching new volleys.
      for (let index = state.pending.length - 1; index >= 0; index--) {
        if (!advanceFleetProjectile(state, state.pending[index]!, dt, ships, hits))
          state.pending.splice(index, 1);
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
          fireFleetWeapon(state, source, target, index, ships, hits);
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
