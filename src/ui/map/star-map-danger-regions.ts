import type { WorldRegion } from '../../core/world-types';
import {
  fixedDangerAtPoint,
  pointInsideDangerRegion,
} from '../../systems/navigation/fixed-danger-geography';
import type { MapCamera } from './map-camera';

type DangerBand = 'green' | 'yellow' | 'red';
interface CachedDangerClouds {
  readonly width: number;
  readonly height: number;
  readonly defaultDanger: number;
  readonly layers: Readonly<Record<DangerBand, HTMLCanvasElement>>;
}

// The cloud texture is baked once for the static world geometry, never on every map redraw.
const cloudCache = new WeakMap<readonly WorldRegion[], CachedDangerClouds>();
const palettes: Readonly<Record<DangerBand, readonly [number, number, number]>> = {
  green: [50, 161, 106],
  yellow: [207, 161, 55],
  red: [191, 70, 68],
};

function createCloudLayer(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function cloudDensity(x: number, y: number): number {
  // Slow-frequency deterministic bands give a feathered nebula texture, not flat colored discs.
  return Math.max(
    0.4,
    Math.min(
      1.05,
      0.77 +
        Math.sin(x * 0.0047 + y * 0.0021) * 0.13 +
        Math.sin(x * 0.0082 - y * 0.0036) * 0.09 +
        Math.cos(x * 0.0027 + y * 0.0073) * 0.08
    )
  );
}

function buildDangerClouds(
  regions: readonly WorldRegion[],
  worldWidth: number,
  worldHeight: number,
  defaultDanger: 0 | 1 | 2 | 3
): CachedDangerClouds {
  const pixelWidth = Math.max(2, Math.ceil(worldWidth / 26));
  const pixelHeight = Math.max(2, Math.ceil(worldHeight / 26));
  const layers = {
    green: createCloudLayer(pixelWidth, pixelHeight),
    yellow: createCloudLayer(pixelWidth, pixelHeight),
    red: createCloudLayer(pixelWidth, pixelHeight),
  };
  const images = (['green', 'yellow', 'red'] as const).map((band) => {
    const ctx = layers[band].getContext('2d');
    if (!ctx) throw new Error('Danger cloud canvas unavailable');
    return { band, ctx, image: ctx.createImageData(pixelWidth, pixelHeight) };
  });

  for (let row = 0; row < pixelHeight; row += 1) {
    const y = ((row + 0.5) * worldHeight) / pixelHeight;
    for (let col = 0; col < pixelWidth; col += 1) {
      const x = ((col + 0.5) * worldWidth) / pixelWidth;
      const point = { x, y };
      const danger = fixedDangerAtPoint(regions, point, defaultDanger);
      const band: DangerBand = danger >= 3 ? 'red' : danger === 2 ? 'yellow' : 'green';
      const highlightedPocket =
        danger === 3 &&
        regions.some(
          (region) => region.dangerLevel === 3 && pointInsideDangerRegion(region, point)
        );
      const noise = cloudDensity(x, y);
      const opacity = Math.round(
        (band === 'red' ? (highlightedPocket ? 68 : 39) : band === 'yellow' ? 72 : 62) * noise
      );
      const { image } = images.find((entry) => entry.band === band)!;
      const index = (row * pixelWidth + col) * 4;
      image.data[index] = palettes[band][0];
      image.data[index + 1] = palettes[band][1];
      image.data[index + 2] = palettes[band][2];
      image.data[index + 3] = opacity;
    }
  }
  for (const layer of images) layer.ctx.putImageData(layer.image, 0, 0);
  return { width: worldWidth, height: worldHeight, defaultDanger, layers };
}

/** Identical fixed geometry drives route scoring, enemy danger and map colors. */
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
  let cached = cloudCache.get(regions);
  if (
    !cached ||
    cached.width !== worldWidth ||
    cached.height !== worldHeight ||
    cached.defaultDanger !== defaultDanger
  ) {
    cached = buildDangerClouds(regions, worldWidth, worldHeight, defaultDanger);
    cloudCache.set(regions, cached);
  }
  const topLeft = camera.worldToScreen({ x: 0, y: 0 }, width, height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (const band of ['red', 'yellow', 'green'] as const) {
    if (!bands[band]) continue;
    ctx.drawImage(
      cached.layers[band],
      topLeft.x,
      topLeft.y,
      camera.scale(worldWidth),
      camera.scale(worldHeight)
    );
  }
  ctx.restore();
}
