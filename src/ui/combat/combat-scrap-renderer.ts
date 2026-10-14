import type {
  CombatVisualAsteroid,
  ThrownAsteroidSnapshot,
} from '../../systems/combat/strategic-combat-types';
import { drawSalvageContainer3d } from '../salvage/salvage-container-mesh';
import { drawSalvageDebris3d } from '../salvage/salvage-debris-mesh';
import { drawSalvageSection3d } from '../salvage/salvage-section-mesh';

type WreckModel = Pick<
  CombatVisualAsteroid,
  'debrisVariant' | 'sectionVariant' | 'containerVariant' | 'rotation3d' | 'effectSeed'
> & { readonly rotation?: number };

export function isCombatScrap(model: WreckModel): boolean {
  return Boolean(model.debrisVariant || model.sectionVariant || model.containerVariant);
}

/** Render the very same cached procedural 3D models used in the salvage map.
 * The caller translates the canvas to the object's world-screen center.
 * The tractor projectile can use the same painter after removing the object
 * from its source field, so capture does not turn a metal frame into a rock.
 */
export function drawCombatScrap(
  context: CanvasRenderingContext2D,
  model: WreckModel | ThrownAsteroidSnapshot,
  radius: number,
  timeSeconds: number
): boolean {
  if (!isCombatScrap(model)) return false;
  const actualRotation = model.rotation3d ?? {
    x: 0.17,
    y: 0.22,
    z: 'rotation' in model && typeof model.rotation === 'number' ? model.rotation : 0,
  };
  // At small screen sizes, thousands of distinct X/Y tumble combinations are
  // invisible but evict the sprite LRU every frame. Reuse eight representative
  // views of the REAL mesh instead; full 3D tumble returns when zoomed in.
  const seed = model.effectSeed ?? 0;
  const rotation =
    model.debrisVariant && radius < 27
      ? {
          x: (seed % 4) * (Math.PI / 4),
          y: (Math.floor(seed / 4) % 2) * (Math.PI / 4),
          z: actualRotation.z,
        }
      : actualRotation;
  const part = { rotation3d: rotation, effectSeed: model.effectSeed ?? 0 };
  if (model.debrisVariant) {
    drawSalvageDebris3d(context, { ...part, variant: model.debrisVariant }, radius, timeSeconds);
  } else if (model.sectionVariant) {
    drawSalvageSection3d(context, { ...part, variant: model.sectionVariant }, radius, timeSeconds);
  } else if (model.containerVariant) {
    drawSalvageContainer3d(context, model.containerVariant, radius, rotation);
  }
  return true;
}
