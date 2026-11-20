import type { LocalSpaceInstance } from '../../core/local-space-types';
import type { SalvageDebris, SalvageField } from '../../core/salvage-types';
import type { SalvageWreck, SalvageSection } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { combatVisibleContactRadius } from './combat-visible-collider';
import type { CombatVisualAsteroid, StrategicCombatArenaOptions } from './strategic-combat-types';

/** Preserve every native mining body, including its real velocity and contact radius. */
export function miningFieldCombatArena(
  instance: LocalSpaceInstance,
  velocity: WorldPoint,
  wrecks: readonly SalvageWreck[] = []
): StrategicCombatArenaOptions {
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
      ...wrecks.map(wreckCombatBody),
    ],
    obstacles: [
      ...instance.asteroids
        .filter((asteroid) => asteroid.kind === 'resource')
        .map((asteroid) => ({
          id: asteroid.id,
          position: { ...asteroid.position },
          radius: asteroid.collisionRadius ?? asteroid.radius,
        })),
      ...wrecks.map((wreck) => ({
        id: wreck.id,
        position: { ...wreck.position },
        radius: wreck.radius * 0.5,
      })),
    ],
  };
}

/** Keep the active combat arena in sync with newly registered career wrecks.
 * Use the same body/radius factory as initial scene creation; no replacement
 * collision engine and no duplicate bodies on repeated settlement ticks.
 */
export function appendCombatWrecksToArena(
  arena: StrategicCombatArenaOptions,
  wrecks: readonly SalvageWreck[]
): void {
  if (!arena.asteroids || !arena.obstacles) {
    throw new Error('FleetCombat career arena requires asteroid and obstacle collections');
  }
  const bodies = arena.asteroids as CombatVisualAsteroid[];
  const obstacles = arena.obstacles as { id: string; position: WorldPoint; radius: number }[];
  const existing = new Set([...bodies.map((body) => body.id), ...obstacles.map((body) => body.id)]);
  for (const wreck of wrecks) {
    if (existing.has(wreck.id)) continue;
    existing.add(wreck.id);
    const body = wreckCombatBody(wreck);
    bodies.push(body);
    obstacles.push({
      id: wreck.id,
      position: body.position,
      radius: body.collisionRadius ?? body.radius,
    });
  }
}

function wreckCombatBody(wreck: SalvageWreck): CombatVisualAsteroid {
  const kind = wreck.sectionVariant || wreck.combatWreckVariant ? 'resource' : 'debris';
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
    collisionRadius: combatVisibleContactRadius({
      id: wreck.id,
      kind,
      radius: wreck.radius,
      ...variant,
    }),
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
  const asteroids = [
    ...unknownDebris.map(debrisCombatBody),
    ...field.wrecks.map(wreckCombatBody),
    ...unknownSections.map(sectionCombatBody),
  ];
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
