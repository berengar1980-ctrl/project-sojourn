import { asteroidSilhouetteInradius } from '../../core/asteroid-silhouette';
import { salvageSolidContactRadius } from '../../core/salvage-contact-profile';
import type { CombatVisualAsteroid } from './strategic-combat-types';

/**
 * The generated "radius" is the draw/envelope scale, NOT a filled collision disk.
 * Rocks have an indented seeded contour; salvage meshes are long, torn 3D
 * structures. Collision disks must fit inside their visible solid footprint.
 *
 * Salvage profiles are based on the mesh model's short-axis half extent in
 * model units, divided by its shared projector scale (radius / 1.9):
 * container ~0.8 / 1.9; debris frame ~0.7 / 1.9; room sections ~1.1 / 1.9.
 * A broad circle around the entire visual envelope is NOT a physical hull.
 */
export function combatVisibleContactRadius(
  asteroid: Pick<
    CombatVisualAsteroid,
    'id' | 'kind' | 'radius' | 'containerVariant' | 'debrisVariant' | 'sectionVariant'
  >
): number {
  if (asteroid.containerVariant) return salvageSolidContactRadius(asteroid.radius, 'container');
  if (asteroid.debrisVariant) return salvageSolidContactRadius(asteroid.radius, 'debris');
  if (asteroid.sectionVariant) return salvageSolidContactRadius(asteroid.radius, 'section');
  return asteroid.radius * asteroidSilhouetteInradius(asteroid.id, asteroid.kind);
}
