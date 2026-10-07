export interface ShipLightVector {
  readonly x: number;
  readonly y: number;
}

interface LitShipDrawOptions {
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly light: ShipLightVector;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly preserveDetail?: boolean;
  readonly directionalStrength?: number;
}

function normalize(light: ShipLightVector): ShipLightVector {
  const length = Math.hypot(light.x, light.y) || 1;
  return { x: light.x / length, y: light.y / length };
}

function toShipLocal(light: ShipLightVector, angle: number): ShipLightVector {
  const cosine = Math.cos(-angle);
  const sine = Math.sin(-angle);
  return {
    x: light.x * cosine - light.y * sine,
    y: light.x * sine + light.y * cosine,
  };
}

export class ShipLightingRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;

  constructor() {
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Ship lighting canvas unavailable.');
    this.context = context;
  }

  draw(context: CanvasRenderingContext2D, options: LitShipDrawOptions): void {
    const renderScale = options.preserveDetail ? 2.4 : this.detailRenderScale(options.width);
    const pixelWidth = Math.max(1, Math.ceil(options.width * renderScale));
    const pixelHeight = Math.max(1, Math.ceil(options.height * renderScale));
    this.resize(pixelWidth, pixelHeight);

    const offscreen = this.context;
    offscreen.clearRect(0, 0, pixelWidth, pixelHeight);
    offscreen.globalCompositeOperation = 'source-over';
    offscreen.imageSmoothingEnabled = true;
    offscreen.imageSmoothingQuality = 'high';
    offscreen.drawImage(options.image, 0, 0, pixelWidth, pixelHeight);

    const worldLight = normalize(options.light);
    const localLight = toShipLocal(worldLight, options.angle);
    this.applyDirectionalLight(
      pixelWidth,
      pixelHeight,
      localLight,
      options.directionalStrength ?? 1
    );

    context.save();
    context.globalAlpha = 0.97;
    context.imageSmoothingEnabled = !(options.preserveDetail && options.width < 18);
    context.imageSmoothingQuality = 'high';
    context.filter = options.preserveDetail ? 'none' : this.appearanceFilter(options.width);
    context.drawImage(this.canvas, options.offsetX, options.offsetY, options.width, options.height);
    context.restore();
  }

  private detailRenderScale(width: number): number {
    if (width < 42) return 0.68;
    if (width < 72) return 0.84;
    return 1;
  }

  private appearanceFilter(width: number): string {
    if (width < 42) return 'saturate(.72) contrast(.8)';
    if (width < 72) return 'saturate(.84) contrast(.88)';
    return 'saturate(.92) contrast(.94)';
  }

  private resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private applyDirectionalLight(
    width: number,
    height: number,
    light: ShipLightVector,
    directionalStrength: number
  ): void {
    const context = this.context;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const reach = Math.max(width, height) * 0.65;
    const gradient = context.createLinearGradient(
      halfWidth + light.x * reach,
      halfHeight + light.y * reach,
      halfWidth - light.x * reach,
      halfHeight - light.y * reach
    );

    const strength = Math.max(0, Math.min(2.5, directionalStrength));
    const alpha = (base: number): number => Math.min(0.92, base * strength);

    gradient.addColorStop(0, `rgba(255,255,238,${alpha(0.11)})`);
    gradient.addColorStop(0.32, `rgba(255,255,255,${alpha(0.03)})`);
    gradient.addColorStop(0.5, `rgba(0,0,0,${alpha(0.045)})`);
    gradient.addColorStop(0.72, `rgba(0,0,0,${alpha(0.18)})`);
    gradient.addColorStop(1, `rgba(0,0,0,${alpha(0.34)})`);

    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }
}
