import {
  invalidateSalvagePhysics,
  salvageFieldPhysicsBodies,
} from '../salvage/salvage-container-motion';
import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';
import type { SalvageDebris, SalvageField } from '../../core/salvage-types';
import type { SalvageWreck, SalvageSection } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { combatVisibleContactRadius } from './combat-visible-collider';
import type {
  CombatVisualAsteroid,
  StrategicCombatArenaOptions,
  StrategicCombatSnapshot,
} from './strategic-combat-types';

/** Preserve every native mining body, including its real velocity and contact radius. */
export function miningFieldCombatArena(
  instance: LocalSpaceInstance,
  velocity: WorldPoint,
  wrecks: readonly SalvageWreck[] = []
): StrategicCombatArenaOptions {
  const wreckBodies = wrecks.map(wreckCombatBody);
  return {
    width: instance.width,
    height: instance.height,
    backdropSeed: instance.seed,
    attackerPosition: { ...instance.ship.position },
    attackerHeadingRadians: instance.ship.headingRadians,
    attackerVelocity: { ...velocity },
    asteroids: [
      ...instance.asteroids.map((asteroid) => ({
        id: asteroid.id,
        kind: asteroid.kind,
        position: { ...asteroid.position },
        velocity: { ...asteroid.physics.velocity },
        angularVelocity: asteroid.physics.angularVelocity,
        physics: { ...asteroid.physics, velocity: { ...asteroid.physics.velocity } },
        radius: asteroid.radius,
        ...(asteroid.collisionRadius !== undefined
          ? { collisionRadius: asteroid.collisionRadius }
          : {}),
        rotation: asteroid.rotation,
      })),
      ...wreckBodies,
    ],
    obstacles: [
      ...instance.asteroids
        .filter((asteroid) => asteroid.kind === 'resource')
        .map((asteroid) => ({
          id: asteroid.id,
          position: { ...asteroid.position },
          radius: asteroid.collisionRadius ?? asteroid.radius,
        })),
      ...wreckBodies
        .filter((wreck) => wreck.kind === 'resource')
        .map((wreck) => ({
          id: wreck.id,
          position: { ...wreck.position },
          radius: wreck.collisionRadius ?? wreck.radius,
        })),
    ],
  };
}

export function wreckCombatBody(wreck: SalvageWreck): CombatVisualAsteroid {
  const kind = wreck.containerVariant || wreck.debrisVariant ? 'debris' : 'resource';
  const variant = {
    ...(wreck.sectionVariant ? { sectionVariant: wreck.sectionVariant } : {}),
    ...(wreck.combatWreckVariant ? { combatWreckVariant: wreck.combatWreckVariant } : {}),
    ...(wreck.debrisVariant ? { debrisVariant: wreck.debrisVariant } : {}),
    ...(wreck.containerVariant ? { containerVariant: wreck.containerVariant } : {}),
  };
  return {
    id: wreck.id,
    kind,
    position: { ...wreck.position },
    radius: wreck.radius,
    contactGeometry: 'circle',
    collisionRadius: Object.keys(variant).length
      ? combatVisibleContactRadius({ id: wreck.id, kind, radius: wreck.radius, ...variant })
      : wreck.radius,
    velocity: { ...(wreck.driftVelocity ?? { x: 0, y: 0 }) },
    angularVelocity: wreck.spin3d?.z ?? 0,
    rotation: wreck.rotation3d?.z ?? wreck.rotation,
    ...variant,
    ...(wreck.rotation3d ? { rotation3d: { ...wreck.rotation3d } } : {}),
    ...(wreck.spin3d ? { spin3d: { ...wreck.spin3d } } : {}),
    ...(wreck.effectSeed !== undefined ? { effectSeed: wreck.effectSeed } : {}),
  };
}

function debrisCombatBody(debris: SalvageDebris): CombatVisualAsteroid {
  return {
    id: debris.id,
    kind: 'debris',
    position: { ...debris.position },
    radius: debris.radius,
    collisionRadius: combatVisibleContactRadius({
      id: debris.id,
      kind: 'debris',
      radius: debris.radius,
      debrisVariant: debris.variant,
    }),
    velocity: { ...debris.driftVelocity },
    angularVelocity: debris.spin3d.z,
    rotation: debris.rotation3d.z,
    debrisVariant: debris.variant,
    rotation3d: { ...debris.rotation3d },
    spin3d: { ...debris.spin3d },
    effectSeed: debris.effectSeed,
  };
}

function sectionCombatBody(section: SalvageSection): CombatVisualAsteroid {
  const kind = 'resource' as const;
  return {
    id: section.id,
    kind,
    position: { ...section.position },
    radius: section.radius,
    collisionRadius: combatVisibleContactRadius({
      id: section.id,
      kind,
      radius: section.radius,
      sectionVariant: section.variant,
    }),
    velocity: { ...section.driftVelocity },
    angularVelocity: section.spin3d.z,
    rotation: section.rotation3d.z,
    sectionVariant: section.variant,
    rotation3d: { ...section.rotation3d },
    spin3d: { ...section.spin3d },
    effectSeed: section.effectSeed,
  };
}

/** One physical scene for campaign salvage combat and PvP; no synthetic PvP debris. */
export function salvageFieldCombatArena(field: SalvageField): StrategicCombatArenaOptions {
  const knownIds = new Set(field.wrecks.map((wreck) => wreck.id));
  const unknownDebris = (field.debris ?? []).filter((debris) => !knownIds.has(debris.id));
  const unknownSections = (field.sections ?? []).filter((section) => !knownIds.has(section.id));
  const physics = new Map(salvageFieldPhysicsBodies(field).map((body) => [body.id, body]));
  const asteroids = [
    ...unknownDebris.map(debrisCombatBody),
    ...field.wrecks.map(wreckCombatBody),
    ...unknownSections.map(sectionCombatBody),
  ].map((body) => {
    const local = physics.get(body.id);
    if (!local) return body;
    return {
      ...body,
      position: { ...local.position },
      velocity: { ...local.physics.velocity },
      angularVelocity: local.physics.angularVelocity,
      rotation: local.rotation,
    };
  });
  return {
    width: field.width,
    height: field.height,
    backdropSeed: field.seed,
    asteroids,
    obstacles: asteroids
      .filter((asteroid) => asteroid.kind === 'resource')
      .map((asteroid) => ({
        id: asteroid.id,
        position: { ...asteroid.position },
        radius: asteroid.collisionRadius ?? asteroid.radius,
      })),
  };
}

export function syncMiningCombatField(
  asteroids: LocalAsteroid[],
  bodies: ReadonlyMap<string, CombatVisualAsteroid>
): void {
  for (let index = asteroids.length - 1; index >= 0; index -= 1) {
    const asteroid = asteroids[index]!;
    const body = bodies.get(asteroid.id);
    if (!body) {
      // Thrown or destroyed bodies must not remain as ghost obstacles.
      asteroids.splice(index, 1);
      continue;
    }
    asteroid.position = { ...body.position };
    asteroid.rotation = body.rotation;
    asteroid.physics.velocity = { ...body.velocity };
    asteroid.physics.angularVelocity = body.physics?.angularVelocity ?? body.angularVelocity;
  }
}

/** Preserve impulses from traffic and the free player between shared combat ticks. */
export function syncFieldTrafficImpulses(
  bodies: readonly LocalAsteroid[],
  arena: StrategicCombatSnapshot['arena']
): void {
  const byId = new Map(arena.asteroids?.map((body) => [body.id, body]));
  for (const body of bodies) {
    const native = byId.get(body.id);
    if (!native) continue;
    Object.assign(native.position, body.position);
    Object.assign(native.velocity, body.physics.velocity);
    Object.assign(native, { angularVelocity: body.physics.angularVelocity });
    if (native.physics) {
      Object.assign(native.physics.velocity, body.physics.velocity);
      native.physics.angularVelocity = body.physics.angularVelocity;
    }
    native.rotation = body.rotation;
    if (native.rotation3d) native.rotation3d.z = body.rotation;
    if (native.spin3d) Object.assign(native.spin3d, { z: body.physics.angularVelocity });
  }
}

/** Apply the duel's moving wreck/debris poses while the local scene is still visible. */
export function syncSalvageCombatField(
  field: SalvageField,
  snapshot: Pick<StrategicCombatSnapshot, 'arena'>
): void {
  if (snapshot.arena.asteroids && snapshot.arena.backdropSeed === field.seed) {
    const remaining = new Map(snapshot.arena.asteroids.map((rock) => [rock.id, rock]));
    // Reconcile ALL native parts; a thrown container must not respawn as loot.
    for (let index = field.wrecks.length - 1; index >= 0; index -= 1) {
      const wreck = field.wrecks[index]!;
      const live = remaining.get(wreck.id);
      if (!live) {
        field.wrecks.splice(index, 1);
        continue;
      }
      wreck.position = { ...live.position };
      wreck.rotation = live.rotation;
      wreck.driftVelocity = { ...live.velocity };
      const tilt = live.rotation3d ?? wreck.rotation3d;
      if (tilt) wreck.rotation3d = { ...tilt, z: live.rotation };
    }
    for (let index = (field.debris?.length ?? 0) - 1; index >= 0; index -= 1) {
      const part = field.debris![index]!;
      const live = remaining.get(part.id);
      if (!live) {
        field.debris!.splice(index, 1);
        continue;
      }
      part.position = { ...live.position };
      part.driftVelocity = { ...live.velocity };
      part.rotation3d = { ...part.rotation3d, z: live.rotation };
    }
    for (let index = (field.sections?.length ?? 0) - 1; index >= 0; index -= 1) {
      const section = field.sections![index]!;
      const live = remaining.get(section.id);
      if (!live) {
        field.sections!.splice(index, 1);
        continue;
      }
      section.position = { ...live.position };
      section.driftVelocity = { ...live.velocity };
      section.rotation3d = { ...section.rotation3d, z: live.rotation };
    }
    invalidateSalvagePhysics(field);
  }
}
