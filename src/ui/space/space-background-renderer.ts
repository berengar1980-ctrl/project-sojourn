import type { WorldPoint } from '../../core/world-types';

interface BackgroundStar {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

interface NebulaBlob {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly driftX: number;
  readonly driftY: number;
  readonly alpha: number;
}

export interface SpaceBackgroundView {
  readonly width: number;
  readonly height: number;
  readonly cameraCenter: WorldPoint;
  readonly cameraZoom: number;
  readonly timeSeconds: number;
}

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

function wrap(value: number, extent: number): number {
  if (extent <= 0) return 0;
  return ((value % extent) + extent) % extent;
}

export class SpaceBackgroundRenderer {
  private readonly farStars: readonly BackgroundStar[];
  private readonly midStars: readonly BackgroundStar[];
  private readonly nebulae: readonly NebulaBlob[];

  constructor(
    private readonly context: CanvasRenderingContext2D,
    seed: number
  ) {
    const random = createRandom(seed);
    this.farStars = this.createStars(random, 120, 0.3, 0.75);
    this.midStars = this.createStars(random, 55, 0.55, 1.35);
    this.nebulae = this.createNebulae(random);
  }

  draw(view: SpaceBackgroundView): void {
    this.drawBase(view.width, view.height);
    this.drawMilkyWay(view);
    this.drawNebulae(view);
    this.drawStars(this.farStars, view, 0.06);
    this.drawStars(this.midStars, view, 0.14);
  }

  private createStars(
    random: () => number,
    count: number,
    minimumSize: number,
    maximumSize: number
  ): readonly BackgroundStar[] {
    const stars: BackgroundStar[] = [];
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: random(),
        y: random(),
        size: minimumSize + random() * (maximumSize - minimumSize),
        alpha: 0.18 + random() * 0.55,
      });
    }
    return stars;
  }

  private createNebulae(random: () => number): readonly NebulaBlob[] {
    const result: NebulaBlob[] = [];
    for (let index = 0; index < 5; index += 1) {
      result.push({
        x: random(),
        y: random(),
        radius: 180 + random() * 260,
        driftX: -4 + random() * 8,
        driftY: -2 + random() * 4,
        alpha: 0.045 + random() * 0.055,
      });
    }
    return result;
  }

  private drawBase(width: number, height: number): void {
    const gradient = this.context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      24,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.82
    );
    gradient.addColorStop(0, '#09111a');
    gradient.addColorStop(0.55, '#050910');
    gradient.addColorStop(1, '#010204');
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, width, height);
  }

  private drawStars(
    stars: readonly BackgroundStar[],
    view: SpaceBackgroundView,
    parallax: number
  ): void {
    const spanX = view.width + 180;
    const spanY = view.height + 180;
    const offsetX = -view.cameraCenter.x * view.cameraZoom * parallax;
    const offsetY = -view.cameraCenter.y * view.cameraZoom * parallax;

    for (const star of stars) {
      const x = wrap(star.x * spanX + offsetX, spanX) - 90;
      const y = wrap(star.y * spanY + offsetY, spanY) - 90;
      this.context.fillStyle = 'rgba(220, 231, 247, ' + star.alpha + ')';
      this.context.fillRect(x, y, star.size, star.size);
    }
  }

  private drawMilkyWay(view: SpaceBackgroundView): void {
    const offsetX = -view.cameraCenter.x * view.cameraZoom * 0.035;
    const offsetY = -view.cameraCenter.y * view.cameraZoom * 0.035;

    this.context.save();
    this.context.translate(view.width * 0.54 + offsetX, view.height * 0.5 + offsetY);
    this.context.rotate(-0.32);

    const bandWidth = Math.max(view.width, view.height) * 1.8;
    const bandHeight = Math.max(180, view.height * 0.36);
    const gradient = this.context.createLinearGradient(0, -bandHeight / 2, 0, bandHeight / 2);
    gradient.addColorStop(0, 'rgba(90, 106, 124, 0)');
    gradient.addColorStop(0.28, 'rgba(106, 119, 137, 0.045)');
    gradient.addColorStop(0.5, 'rgba(174, 161, 143, 0.075)');
    gradient.addColorStop(0.72, 'rgba(84, 104, 128, 0.04)');
    gradient.addColorStop(1, 'rgba(72, 86, 104, 0)');
    this.context.fillStyle = gradient;
    this.context.fillRect(-bandWidth / 2, -bandHeight / 2, bandWidth, bandHeight);

    this.context.restore();
  }

  private drawNebulae(view: SpaceBackgroundView): void {
    const parallax = 0.095;
    const offsetX = -view.cameraCenter.x * view.cameraZoom * parallax;
    const offsetY = -view.cameraCenter.y * view.cameraZoom * parallax;

    for (let index = 0; index < this.nebulae.length; index += 1) {
      const nebula = this.nebulae[index]!;
      const driftX = nebula.driftX * view.timeSeconds;
      const driftY = nebula.driftY * view.timeSeconds;
      const x = wrap(nebula.x * (view.width + 500) + offsetX + driftX, view.width + 500) - 250;
      const y = wrap(nebula.y * (view.height + 400) + offsetY + driftY, view.height + 400) - 200;
      const radius = nebula.radius;

      const gradient = this.context.createRadialGradient(
        x - radius * 0.12,
        y - radius * 0.08,
        radius * 0.05,
        x,
        y,
        radius
      );
      const warm = index % 2 === 0;
      gradient.addColorStop(
        0,
        warm
          ? 'rgba(112, 105, 122, ' + nebula.alpha + ')'
          : 'rgba(72, 98, 126, ' + nebula.alpha + ')'
      );
      gradient.addColorStop(
        0.55,
        warm
          ? 'rgba(78, 71, 88, ' + nebula.alpha * 0.55 + ')'
          : 'rgba(54, 76, 104, ' + nebula.alpha * 0.5 + ')'
      );
      gradient.addColorStop(1, 'rgba(20, 28, 38, 0)');

      this.context.fillStyle = gradient;
      this.context.beginPath();
      this.context.ellipse(x, y, radius, radius * 0.55, index * 0.37, 0, Math.PI * 2);
      this.context.fill();
    }
  }
}
