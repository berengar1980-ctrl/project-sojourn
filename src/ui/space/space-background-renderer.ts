import type { WorldPoint } from '../../core/world-types';

interface BackgroundStar {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

interface NebulaLobe {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly radius: number;
  readonly alpha: number;
}

interface NebulaCloud {
  readonly x: number;
  readonly y: number;
  readonly driftX: number;
  readonly driftY: number;
  readonly warm: boolean;
  readonly lobes: readonly NebulaLobe[];
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
  private readonly nebulae: readonly NebulaCloud[];

  constructor(
    private readonly context: CanvasRenderingContext2D,
    seed: number
  ) {
    const random = createRandom(seed);
    this.farStars = this.createStars(random, 170, 0.35, 0.9, 0.24, 0.72);
    this.midStars = this.createStars(random, 95, 0.8, 1.8, 0.42, 0.9);
    this.nebulae = this.createNebulae(random);
  }

  draw(view: SpaceBackgroundView): void {
    this.drawBase(view.width, view.height);
    this.drawMilkyWay(view);
    this.drawNebulae(view);
    this.drawStars(this.farStars, view, 0.075);
    this.drawStars(this.midStars, view, 0.24);
  }

  private createStars(
    random: () => number,
    count: number,
    minimumSize: number,
    maximumSize: number,
    minimumAlpha: number,
    maximumAlpha: number
  ): readonly BackgroundStar[] {
    const stars: BackgroundStar[] = [];
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: random(),
        y: random(),
        size: minimumSize + random() * (maximumSize - minimumSize),
        alpha: minimumAlpha + random() * (maximumAlpha - minimumAlpha),
      });
    }
    return stars;
  }

  private createNebulae(random: () => number): readonly NebulaCloud[] {
    const result: NebulaCloud[] = [];
    for (let cloudIndex = 0; cloudIndex < 5; cloudIndex += 1) {
      const lobes: NebulaLobe[] = [];
      const lobeCount = 8 + Math.floor(random() * 6);
      const baseRadius = 110 + random() * 170;

      for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
        const angle = random() * Math.PI * 2;
        const spread = baseRadius * (0.18 + random() * 0.72);
        lobes.push({
          offsetX: Math.cos(angle) * spread,
          offsetY: Math.sin(angle) * spread * 0.58,
          radius: baseRadius * (0.36 + random() * 0.48),
          alpha: 0.035 + random() * 0.045,
        });
      }

      result.push({
        x: random(),
        y: random(),
        driftX: -3 + random() * 6,
        driftY: -1.4 + random() * 2.8,
        warm: cloudIndex % 2 === 0,
        lobes,
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
      this.context.fillStyle = 'rgba(224, 235, 250, ' + star.alpha + ')';
      this.context.fillRect(x, y, star.size, star.size);
    }
  }

  private drawMilkyWay(view: SpaceBackgroundView): void {
    const offsetX = -view.cameraCenter.x * view.cameraZoom * 0.045;
    const offsetY = -view.cameraCenter.y * view.cameraZoom * 0.045;

    this.context.save();
    this.context.translate(view.width * 0.54 + offsetX, view.height * 0.5 + offsetY);
    this.context.rotate(-0.32);

    const bandWidth = Math.max(view.width, view.height) * 1.9;
    const bandHeight = Math.max(220, view.height * 0.42);
    const gradient = this.context.createLinearGradient(0, -bandHeight / 2, 0, bandHeight / 2);
    gradient.addColorStop(0, 'rgba(90, 106, 124, 0)');
    gradient.addColorStop(0.22, 'rgba(104, 123, 148, 0.055)');
    gradient.addColorStop(0.44, 'rgba(177, 164, 145, 0.105)');
    gradient.addColorStop(0.58, 'rgba(126, 136, 158, 0.09)');
    gradient.addColorStop(0.78, 'rgba(74, 101, 132, 0.05)');
    gradient.addColorStop(1, 'rgba(72, 86, 104, 0)');
    this.context.fillStyle = gradient;
    this.context.fillRect(-bandWidth / 2, -bandHeight / 2, bandWidth, bandHeight);

    this.context.restore();
  }

  private drawNebulae(view: SpaceBackgroundView): void {
    const parallax = 0.13;
    const offsetX = -view.cameraCenter.x * view.cameraZoom * parallax;
    const offsetY = -view.cameraCenter.y * view.cameraZoom * parallax;
    const spanX = view.width + 700;
    const spanY = view.height + 560;

    this.context.save();
    this.context.globalCompositeOperation = 'screen';

    for (const cloud of this.nebulae) {
      const centerX = wrap(cloud.x * spanX + offsetX + cloud.driftX * view.timeSeconds, spanX) - 350;
      const centerY = wrap(cloud.y * spanY + offsetY + cloud.driftY * view.timeSeconds, spanY) - 280;

      for (const lobe of cloud.lobes) {
        this.drawNebulaLobe(centerX + lobe.offsetX, centerY + lobe.offsetY, lobe, cloud.warm);
      }
    }

    this.context.restore();
  }

  private drawNebulaLobe(
    x: number,
    y: number,
    lobe: NebulaLobe,
    warm: boolean
  ): void {
    const gradient = this.context.createRadialGradient(
      x - lobe.radius * 0.18,
      y - lobe.radius * 0.12,
      lobe.radius * 0.04,
      x,
      y,
      lobe.radius
    );

    if (warm) {
      gradient.addColorStop(0, 'rgba(132, 103, 122, ' + lobe.alpha + ')');
      gradient.addColorStop(0.42, 'rgba(94, 75, 103, ' + lobe.alpha * 0.7 + ')');
      gradient.addColorStop(1, 'rgba(37, 28, 45, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(76, 116, 151, ' + lobe.alpha + ')');
      gradient.addColorStop(0.42, 'rgba(55, 84, 122, ' + lobe.alpha * 0.68 + ')');
      gradient.addColorStop(1, 'rgba(24, 38, 55, 0)');
    }

    this.context.fillStyle = gradient;
    this.context.beginPath();
    this.context.arc(x, y, lobe.radius, 0, Math.PI * 2);
    this.context.fill();
  }
}
