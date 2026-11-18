import type { WorldRegion } from '../../core/world-types';
import type { MapCamera } from './map-camera';
import { potentialDangerFogBounds, sampleDangerFog } from './star-map-danger-fog-field';

type DangerBand = 'green' | 'yellow' | 'red';

interface CachedDangerClouds {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly defaultDanger: number;
  readonly originX: number;
  readonly originY: number;
  readonly extentWidth: number;
  readonly extentHeight: number;
  readonly layers: Readonly<Record<DangerBand, HTMLCanvasElement>>;
}

const cloudCache = new WeakMap<readonly WorldRegion[], CachedDangerClouds>();

const palettes: Readonly<Record<DangerBand, readonly [number, number, number, number]>> = {
  green: [34, 143, 112, 147],
  yellow: [184, 151, 67, 155],
  red: [164, 65, 69, 86],
};

function newFogCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Unlike a world-sized rectangle, the green/yellow fog atlas extends far past
 * both the navigable sector and the overview camera's fitted location bounds.
 * Its outermost pixels are transparent, so panning/zooming never shows a seam.
 */
function buildDangerClouds(
  regions: readonly WorldRegion[],
  worldWidth: number,
  worldHeight: number,
  defaultDanger: 0 | 1 | 2 | 3
): CachedDangerClouds {
  const paddingX = Math.max(1600, worldWidth * 0.56);
  const paddingY = Math.max(1500, worldHeight * 0.56);
  const originX = -paddingX;
  const originY = -paddingY;
  const extentWidth = worldWidth + paddingX * 2;
  const extentHeight = worldHeight + paddingY * 2;
  const pixelWidth = Math.max(2, Math.ceil(extentWidth / 16));
  const pixelHeight = Math.max(2, Math.ceil(extentHeight / 16));
  const layers = {
    green: newFogCanvas(pixelWidth, pixelHeight),
    yellow: newFogCanvas(pixelWidth, pixelHeight),
    red: newFogCanvas(pixelWidth, pixelHeight),
  };

  const buffers = (['yellow', 'green', 'red'] as const).map((band) => {
    const context = layers[band].getContext('2d');
    if (!context) throw new Error('Danger fog canvas unavailable');
    return { band, context, image: context.createImageData(pixelWidth, pixelHeight) };
  });

  // Only compute warped organic fog inside a conservative influence region.
  // Most of the extended atlas lies beyond all clouds and must remain transparent.
  const possibleFog = potentialDangerFogBounds(regions);
  const candidates = regions.map((region, index) => ({ region, bounds: possibleFog[index]! }));
  const eligible: WorldRegion[] = [];
  for (let row = 0; row < pixelHeight; row += 1) {
    const y = originY + ((row + 0.5) * extentHeight) / pixelHeight;
    const possibleRow = candidates.filter(
      ({ bounds }) => y >= bounds[1] && y <= bounds[3]
    );
    if (possibleRow.length === 0) continue;
    for (let col = 0; col < pixelWidth; col += 1) {
      const x = originX + ((col + 0.5) * extentWidth) / pixelWidth;
      eligible.length = 0;
      for (const { region, bounds } of possibleRow)
        if (x >= bounds[0] && x <= bounds[2]) eligible.push(region);
      if (eligible.length === 0) continue;
      const fog = sampleDangerFog(eligible, { x, y });
      const index = (row * pixelWidth + col) * 4;
      for (const buffer of buffers) {
        // Narrows is already a red world. Red pirate territories carve gaps in
        // the green/yellow clouds; no darker red circle is painted on the base.
        const weight = buffer.band === 'red' && defaultDanger === 3 ? 0 : fog[buffer.band];
        if (weight < 0.005) continue;
        const [r, g, b, alpha] = palettes[buffer.band];
        buffer.image.data[index] = r;
        buffer.image.data[index + 1] = g;
        buffer.image.data[index + 2] = b;
        buffer.image.data[index + 3] = Math.round(alpha * weight);
      }
    }
  }
  for (const buffer of buffers) buffer.context.putImageData(buffer.image, 0, 0);
  return {
    worldWidth,
    worldHeight,
    defaultDanger,
    originX,
    originY,
    extentWidth,
    extentHeight,
    layers,
  };
}

/** Voidbound-style red background under overlapping, organically feathered fog. */
export function drawStarMapDangerRegions(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  regions: readonly WorldRegion[],
  bands: Readonly<Record<DangerBand, boolean>>,
  visible: boolean,
  width: number,
  height: number,
  worldWidth: number,
  worldHeight: number,
  defaultDanger: 0 | 1 | 2 | 3 = 0
): void {
  if (!visible) return;
  ctx.save();

  // Screen-wide base, not clipped to world x=0..width or y=0..height.
  // This is the ONLY red background in the Narrows, including pirate hotspots.
  if (defaultDanger === 3 && bands.red) {
    const ambient = ctx.createLinearGradient(0, 0, width, height);
    ambient.addColorStop(0, 'rgba(168,47,65,0.21)');
    ambient.addColorStop(0.5, 'rgba(178,51,68,0.24)');
    ambient.addColorStop(1, 'rgba(162,46,63,0.20)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, width, height);
  }

  let cached = cloudCache.get(regions);
  if (
    !cached ||
    cached.worldWidth !== worldWidth ||
    cached.worldHeight !== worldHeight ||
    cached.defaultDanger !== defaultDanger
  ) {
    cached = buildDangerClouds(regions, worldWidth, worldHeight, defaultDanger);
    cloudCache.set(regions, cached);
  }

  const origin = camera.worldToScreen({ x: cached.originX, y: cached.originY }, width, height);
  ctx.imageSmoothingEnabled = true;
  // Yellow first, green second: both remain soft; red pockets interrupt without
  // adding an opaque or darker red stamp over the ambient nebula.
  for (const band of ['yellow', 'green', 'red'] as const) {
    if (!bands[band]) continue;
    ctx.drawImage(
      cached.layers[band],
      origin.x,
      origin.y,
      camera.scale(cached.extentWidth),
      camera.scale(cached.extentHeight)
    );
  }
  ctx.restore();
}
