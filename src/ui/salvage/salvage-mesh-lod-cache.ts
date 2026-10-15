import { drawProjectedSalvageMesh, type Face } from './salvage-container-mesh';

/**
 * Reuse actual 3D wreck meshes for distant LODs, not generic box silhouettes.
 * Rasterize a type and tilt only on first encounter. Objects keep their
 * individual scale and their continuous Z rotation as a cheap canvas transform.
 *
 * An LRU cap prevents unbounded atlas growth on long-running salvage sessions.
 */
const ANGLE_STEPS = 8;
const MAX_CACHED_VIEWS = 96;
const TWO_PI = Math.PI * 2;
const distantSprites = new Map<string, HTMLCanvasElement>();

interface Rotation3d {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function bucket(angle: number): number {
  return ((Math.round((angle / TWO_PI) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
}

/**
 * @returns true if drawn from cache, false if the browser cannot make a canvas.
 * Never convert the geometry to a different generic silhouette.
 */
export function drawCachedSalvageMesh(
  context: CanvasRenderingContext2D,
  type: string,
  mesh: readonly Face[],
  radius: number,
  rotation: Rotation3d,
  texturePixels: number
): boolean {
  if (radius <= 0) return true;

  const xIndex = bucket(rotation.x);
  const yIndex = bucket(rotation.y);
  const key = type + ':' + texturePixels + ':' + xIndex + ':' + yIndex;
  let sprite = distantSprites.get(key);

  if (!sprite) {
    const canvas = document.createElement('canvas');
    canvas.width = texturePixels;
    canvas.height = texturePixels;
    const spriteContext = canvas.getContext('2d');
    if (!spriteContext) return false;

    spriteContext.translate(texturePixels / 2, texturePixels / 2);
    const captureRadius = texturePixels / 3.4;
    drawProjectedSalvageMesh(spriteContext, mesh, captureRadius, {
      x: (xIndex * TWO_PI) / ANGLE_STEPS,
      y: (yIndex * TWO_PI) / ANGLE_STEPS,
      z: 0,
    });
    sprite = canvas;
  } else {
    // Refresh on use, so frequently visible variants survive cache pressure.
    distantSprites.delete(key);
  }

  distantSprites.set(key, sprite);
  if (distantSprites.size > MAX_CACHED_VIEWS) {
    const eldest = distantSprites.keys().next().value;
    if (eldest !== undefined) distantSprites.delete(eldest);
  }

  // The 3D projector flips Y before drawing. Consequently +Z rotation in
  // model coordinates corresponds to -Z rotation on the 2D canvas.
  const size = radius * 3.4;
  context.save();
  context.rotate(-rotation.z);
  context.drawImage(sprite, -size / 2, -size / 2, size, size);
  context.restore();
  return true;
}
