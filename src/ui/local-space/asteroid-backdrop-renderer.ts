import type { WorldPoint } from '../../core/world-types';

interface BackdropView {
  readonly width: number;
  readonly height: number;
  readonly cameraCenter: WorldPoint;
  readonly cameraZoom: number;
}

interface RockPoint {
  readonly x: number;
  readonly y: number;
}

const PARALLAX = 0.72;
const WORLD_PADDING = 0.32;
const TEXTURE_WIDTH = 2048;
const ROCK_COUNT = 340;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function drawDistantRock(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  random: () => number
): void {
  const vertices = 8 + Math.floor(random() * 5);
  const phase = random() * Math.PI * 2;
  const points: RockPoint[] = [];
  for (let index = 0; index < vertices; index += 1) {
    const angle = phase + (index / vertices) * Math.PI * 2;
    const distance = radius * (0.75 + random() * 0.3);
    points.push({
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
    });
  }

  const gradient = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  gradient.addColorStop(0, '#46515c');
  gradient.addColorStop(0.34, '#303b46');
  gradient.addColorStop(1, '#141d29');
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]!.x, points[index]!.y);
  }
  context.closePath();
  context.fill();

  // These facets are baked once. No per-frame lights, outlines or gradients.
  context.fillStyle = 'rgba(9, 16, 25, .24)';
  context.beginPath();
  context.moveTo(points[2]!.x, points[2]!.y);
  context.lineTo(x + radius * 0.08, y + radius * 0.08);
  context.lineTo(points[5]!.x, points[5]!.y);
  context.closePath();
  context.fill();
}

/**
 * A decorative, single-texture asteroid layer. It is never part of the
 * local-space simulation and therefore cannot block routes or be selected.
 */
export class AsteroidBackdropRenderer {
  private readonly texture: HTMLCanvasElement;
  private readonly left: number;
  private readonly top: number;
  private readonly spanWidth: number;
  private readonly spanHeight: number;

  constructor(
    private readonly context: CanvasRenderingContext2D,
    seed: number,
    private readonly worldWidth: number,
    private readonly worldHeight: number
  ) {
    this.left = -worldWidth * WORLD_PADDING;
    this.top = -worldHeight * WORLD_PADDING;
    this.spanWidth = worldWidth * (1 + WORLD_PADDING * 2);
    this.spanHeight = worldHeight * (1 + WORLD_PADDING * 2);

    const texture = document.createElement('canvas');
    texture.width = TEXTURE_WIDTH;
    texture.height = Math.round((TEXTURE_WIDTH * this.spanHeight) / this.spanWidth);
    const offscreen = texture.getContext('2d');
    if (!offscreen) throw new Error('Asteroid backdrop canvas unavailable.');

    const random = createRandom(seed ^ 0x6d8a72f1);
    offscreen.scale(texture.width / this.spanWidth, texture.height / this.spanHeight);

    for (let index = 0; index < ROCK_COUNT; index += 1) {
      const radius = 14 + random() * 39;
      const normalizedX = random();
      const band = 0.49 + Math.sin(normalizedX * Math.PI * 2.5) * 0.12;
      const normalizedY =
        random() < 0.63 ? band + (random() - 0.5) * 0.46 : random();
      const x = radius + normalizedX * (this.spanWidth - radius * 2);
      const y =
        radius +
        Math.max(0, Math.min(1, normalizedY)) * (this.spanHeight - radius * 2);
      drawDistantRock(offscreen, x, y, radius, random);
    }
    this.texture = texture;
  }

  draw(view: BackdropView): void {
    const zoom = view.cameraZoom;
    if (zoom <= 0 || view.width <= 0 || view.height <= 0) return;

    const centerX = this.worldWidth * 0.5;
    const centerY = this.worldHeight * 0.5;
    const left =
      view.width * 0.5 +
      (this.left - centerX - (view.cameraCenter.x - centerX) * PARALLAX) * zoom;
    const top =
      view.height * 0.5 +
      (this.top - centerY - (view.cameraCenter.y - centerY) * PARALLAX) * zoom;
    const scaledWidth = this.spanWidth * zoom;
    const scaledHeight = this.spanHeight * zoom;

    const visibleLeft = Math.max(0, left);
    const visibleTop = Math.max(0, top);
    const visibleRight = Math.min(view.width, left + scaledWidth);
    const visibleBottom = Math.min(view.height, top + scaledHeight);
    if (visibleLeft >= visibleRight || visibleTop >= visibleBottom) return;

    // Source cropping keeps the draw cost proportional to the visible viewport.
    const sourceX = ((visibleLeft - left) / scaledWidth) * this.texture.width;
    const sourceY = ((visibleTop - top) / scaledHeight) * this.texture.height;
    const sourceWidth =
      ((visibleRight - visibleLeft) / scaledWidth) * this.texture.width;
    const sourceHeight =
      ((visibleBottom - visibleTop) / scaledHeight) * this.texture.height;
    this.context.drawImage(
      this.texture,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      visibleLeft,
      visibleTop,
      visibleRight - visibleLeft,
      visibleBottom - visibleTop
    );
  }
}
