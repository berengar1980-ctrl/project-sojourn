import type { StationType, WorldPoint } from '../../core/world-types';
import {
  createStationLayout,
  type StationLayout,
  type StationModuleLayout,
} from './station-layout-generator';

export type StationDetailLevel = 'map' | 'dock';

interface StationDrawOptions {
  readonly id: string;
  readonly type: StationType;
  readonly point: WorldPoint;
  readonly radius: number;
  readonly detailLevel: StationDetailLevel;
  readonly light?: WorldPoint;
}

function normalize(point: WorldPoint): WorldPoint {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function rotate(point: WorldPoint, angle: number): WorldPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export class ProceduralStationRenderer {
  private readonly layouts = new Map<string, StationLayout>();
  private readonly spriteCanvas = document.createElement('canvas');
  private readonly spriteContext: CanvasRenderingContext2D;

  constructor(private readonly context: CanvasRenderingContext2D) {
    const spriteContext = this.spriteCanvas.getContext('2d');
    if (!spriteContext) throw new Error('Station sprite canvas unavailable.');
    this.spriteContext = spriteContext;
  }

  draw(options: StationDrawOptions): void {
    const layout = this.layout(options.id, options.type);
    const dockDetail = options.detailLevel === 'dock';
    const renderScale = dockDetail ? 2.2 : 2;
    const extent = options.radius * 2.35;
    const pixelSize = Math.max(8, Math.ceil(extent * renderScale));

    if (this.spriteCanvas.width !== pixelSize || this.spriteCanvas.height !== pixelSize) {
      this.spriteCanvas.width = pixelSize;
      this.spriteCanvas.height = pixelSize;
    }

    const sprite = this.spriteContext;
    sprite.setTransform(1, 0, 0, 1, 0, 0);
    sprite.clearRect(0, 0, pixelSize, pixelSize);
    sprite.setTransform(renderScale, 0, 0, renderScale, pixelSize / 2, pixelSize / 2);
    sprite.save();
    sprite.rotate(layout.rotation);

    this.drawArms(layout, options.radius, dockDetail);
    this.drawRing(layout, options.radius, options.type, dockDetail);
    for (const module of layout.modules) {
      this.drawModule(module, options.radius, options.type, dockDetail);
    }
    this.drawCore(layout, options.radius, options.type, dockDetail);
    if (dockDetail) this.drawServiceDetails(layout, options.radius, options.type);
    this.applyDirectionalLight(options.radius, layout.rotation, options.light);
    sprite.restore();

    this.context.save();
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
    this.context.drawImage(
      this.spriteCanvas,
      options.point.x - extent / 2,
      options.point.y - extent / 2,
      extent,
      extent
    );
    this.context.restore();
  }

  private layout(id: string, type: StationType): StationLayout {
    const key = id + ':' + type;
    const cached = this.layouts.get(key);
    if (cached) return cached;

    const layout = createStationLayout(id, type);
    this.layouts.set(key, layout);
    return layout;
  }

  private drawArms(layout: StationLayout, radius: number, dockDetail: boolean): void {
    const context = this.spriteContext;
    context.lineCap = 'square';

    for (const arm of layout.arms) {
      const length = radius * arm.length;
      const width = Math.max(dockDetail ? 3 : 1.4, radius * arm.width);
      context.save();
      context.rotate(arm.angle);
      context.strokeStyle = 'rgba(98, 116, 123, .86)';
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(radius * layout.coreRadius * 0.7, 0);
      context.lineTo(length, 0);
      context.stroke();

      context.strokeStyle = 'rgba(185, 197, 199, .38)';
      context.lineWidth = Math.max(0.7, width * 0.22);
      context.beginPath();
      context.moveTo(radius * layout.coreRadius * 0.85, -width * 0.24);
      context.lineTo(length, -width * 0.24);
      context.stroke();

      if (dockDetail) {
        context.strokeStyle = 'rgba(52, 66, 71, .9)';
        context.lineWidth = Math.max(0.8, width * 0.18);
        const start = radius * layout.coreRadius;
        const step = Math.max(7, radius * 0.09);
        for (let x = start; x < length - step * 0.3; x += step) {
          context.beginPath();
          context.moveTo(x, -width * 0.55);
          context.lineTo(x + step * 0.6, width * 0.55);
          context.stroke();
        }
      }
      context.restore();
    }
  }

  private drawRing(
    layout: StationLayout,
    radius: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    if (type === 'shipyard' || type === 'pirate') return;

    const context = this.spriteContext;
    const ringRadius = radius * layout.ringRadius;
    context.strokeStyle = type === 'military' ? '#68767d' : '#74898f';
    context.lineWidth = Math.max(dockDetail ? 4 : 1.2, radius * 0.055);
    context.beginPath();
    context.arc(0, 0, ringRadius, 0, Math.PI * 2);
    context.stroke();

    if (!dockDetail) return;
    context.strokeStyle = 'rgba(173, 187, 188, .3)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, ringRadius * 0.9, 0, Math.PI * 2);
    context.stroke();
  }

  private drawCore(
    layout: StationLayout,
    radius: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.spriteContext;
    const coreRadius = radius * layout.coreRadius;
    const sides = type === 'military' ? 8 : type === 'pirate' ? 7 : 10;
    const gradient = context.createRadialGradient(
      -coreRadius * 0.3,
      -coreRadius * 0.35,
      coreRadius * 0.08,
      0,
      0,
      coreRadius
    );
    gradient.addColorStop(0, type === 'pirate' ? '#9c8879' : '#aebdc0');
    gradient.addColorStop(0.52, type === 'military' ? '#53636b' : '#61757b');
    gradient.addColorStop(1, type === 'pirate' ? '#403a37' : '#273238');

    context.fillStyle = gradient;
    context.strokeStyle = type === 'pirate' ? '#a2856e' : '#9aafb4';
    context.lineWidth = Math.max(1, radius * 0.018);
    this.polygon(coreRadius, sides);
    context.fill();
    context.stroke();

    context.save();
    if (dockDetail) {
      context.fillStyle = '#182126';
      context.beginPath();
      context.arc(0, 0, coreRadius * 0.32, 0, Math.PI * 2);
      context.fill();
    } else {
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.arc(0, 0, coreRadius * 0.32, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.strokeStyle = 'rgba(176, 203, 207, .5)';
    context.lineWidth = Math.max(0.8, radius * 0.012);
    context.beginPath();
    context.arc(0, 0, coreRadius * 0.5, 0, Math.PI * 2);
    context.stroke();

    if (!dockDetail) return;
    context.strokeStyle = 'rgba(55, 65, 68, .72)';
    context.lineWidth = 1;
    for (let index = 0; index < sides; index += 1) {
      const angle = (index / sides) * Math.PI * 2;
      context.beginPath();
      context.moveTo(Math.cos(angle) * coreRadius * 0.55, Math.sin(angle) * coreRadius * 0.55);
      context.lineTo(Math.cos(angle) * coreRadius * 0.9, Math.sin(angle) * coreRadius * 0.9);
      context.stroke();
    }
  }

  private drawModule(
    module: StationModuleLayout,
    radius: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.spriteContext;
    const width = module.width * radius;
    const height = module.height * radius;

    context.save();
    context.translate(module.x * radius, module.y * radius);
    context.rotate(module.rotation);

    if (module.kind === 'tank') this.drawTank(width, height, type, dockDetail);
    else if (module.kind === 'dock') this.drawDock(width, height, type, dockDetail);
    else if (module.kind === 'radiator') this.drawRadiator(width, height, dockDetail);
    else if (module.kind === 'sensor') this.drawSensor(width, height, dockDetail);
    else if (module.kind === 'cargo') this.drawCargo(width, height, type, dockDetail);
    else if (module.kind === 'armor') this.drawArmor(width, height, dockDetail);
    else this.drawBoxModule(module.kind, width, height, type, dockDetail);

    if (dockDetail) this.drawWear(width, height, module.phase, type);
    context.restore();
  }

  private drawBoxModule(
    kind: 'habitat' | 'utility',
    width: number,
    height: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.spriteContext;
    context.fillStyle = type === 'pirate' ? '#5b5149' : kind === 'habitat' ? '#647a80' : '#52646a';
    context.strokeStyle = type === 'pirate' ? '#9a806b' : '#91a6aa';
    context.lineWidth = 1;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.strokeRect(-width / 2, -height / 2, width, height);

    if (!dockDetail) return;
    context.strokeStyle = 'rgba(39, 50, 54, .8)';
    const bands = 3;
    for (let index = 1; index < bands; index += 1) {
      const x = -width / 2 + (width * index) / bands;
      context.beginPath();
      context.moveTo(x, -height / 2);
      context.lineTo(x, height / 2);
      context.stroke();
    }

    if (kind !== 'habitat') return;
    context.fillStyle = 'rgba(203, 225, 173, .75)';
    for (let index = 0; index < 3; index += 1) {
      context.fillRect(-width * 0.3 + index * width * 0.28, -1, 2, 2);
    }
  }

  private drawTank(width: number, height: number, type: StationType, dockDetail: boolean): void {
    const context = this.spriteContext;
    const radiusX = Math.max(width * 0.48, 2);
    const radiusY = Math.max(height * 0.48, 2);
    context.fillStyle = type === 'pirate' ? '#6b5848' : '#66777a';
    context.strokeStyle = type === 'pirate' ? '#a27b5a' : '#9cacaa';
    context.beginPath();
    context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (!dockDetail) return;
    context.strokeStyle = 'rgba(36, 46, 49, .85)';
    for (const fraction of [-0.42, 0, 0.42]) {
      context.beginPath();
      context.moveTo(fraction * radiusX, -radiusY * 0.88);
      context.lineTo(fraction * radiusX, radiusY * 0.88);
      context.stroke();
    }
  }

  private drawDock(width: number, height: number, type: StationType, dockDetail: boolean): void {
    const context = this.spriteContext;
    const frame = Math.max(1.2, Math.min(width, height) * 0.16);
    context.strokeStyle = type === 'pirate' ? '#a77c5e' : '#91a8ad';
    context.lineWidth = frame;
    context.beginPath();
    context.moveTo(-width / 2, -height / 2);
    context.lineTo(width / 2, -height / 2);
    context.lineTo(width / 2, height / 2);
    context.moveTo(-width / 2, height / 2);
    context.lineTo(-width / 2, -height / 2);
    context.stroke();

    context.strokeStyle = 'rgba(49, 62, 66, .9)';
    context.lineWidth = Math.max(1, frame * 0.35);
    context.beginPath();
    context.moveTo(-width * 0.34, 0);
    context.lineTo(width * 0.34, 0);
    context.stroke();

    if (!dockDetail) return;
    context.fillStyle = '#d5b36d';
    context.fillRect(width * 0.38, -height * 0.32, 2, 2);
    context.fillRect(width * 0.38, height * 0.28, 2, 2);
  }

  private drawRadiator(width: number, height: number, dockDetail: boolean): void {
    const context = this.spriteContext;
    context.fillStyle = '#35464d';
    context.strokeStyle = '#778d91';
    context.lineWidth = 1;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.strokeRect(-width / 2, -height / 2, width, height);

    const lines = dockDetail ? 6 : 3;
    context.strokeStyle = 'rgba(137, 163, 166, .38)';
    for (let index = 1; index < lines; index += 1) {
      const y = -height / 2 + (height * index) / lines;
      context.beginPath();
      context.moveTo(-width / 2, y);
      context.lineTo(width / 2, y);
      context.stroke();
    }
  }

  private drawSensor(width: number, height: number, dockDetail: boolean): void {
    const context = this.spriteContext;
    context.strokeStyle = '#9bb1b5';
    context.lineWidth = Math.max(1, Math.min(width, height) * 0.08);
    context.beginPath();
    context.moveTo(-width * 0.4, 0);
    context.lineTo(width * 0.2, 0);
    context.stroke();
    context.beginPath();
    context.arc(width * 0.26, 0, Math.max(2, height * 0.35), -1.15, 1.15);
    context.stroke();

    if (!dockDetail) return;
    context.strokeStyle = 'rgba(125, 204, 219, .6)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(width * 0.26, 0, Math.max(3, height * 0.48), -0.9, 0.9);
    context.stroke();
  }

  private drawCargo(width: number, height: number, type: StationType, dockDetail: boolean): void {
    const context = this.spriteContext;
    const columns = dockDetail ? 3 : 2;
    const gap = Math.max(1, width * 0.04);
    const unitWidth = (width - gap * (columns - 1)) / columns;

    for (let index = 0; index < columns; index += 1) {
      const x = -width / 2 + index * (unitWidth + gap);
      context.fillStyle = type === 'pirate' ? (index % 2 === 0 ? '#625245' : '#514b48') : '#56666b';
      context.strokeStyle = type === 'pirate' ? '#98755b' : '#82969a';
      context.fillRect(x, -height / 2, unitWidth, height);
      context.strokeRect(x, -height / 2, unitWidth, height);
    }
  }

  private drawArmor(width: number, height: number, dockDetail: boolean): void {
    const context = this.spriteContext;
    context.fillStyle = '#46555c';
    context.strokeStyle = '#85979d';
    context.beginPath();
    context.moveTo(-width / 2, -height * 0.3);
    context.lineTo(-width * 0.3, -height / 2);
    context.lineTo(width * 0.42, -height / 2);
    context.lineTo(width / 2, 0);
    context.lineTo(width * 0.3, height / 2);
    context.lineTo(-width * 0.42, height / 2);
    context.closePath();
    context.fill();
    context.stroke();

    if (!dockDetail) return;
    context.strokeStyle = 'rgba(35, 44, 48, .8)';
    context.beginPath();
    context.moveTo(-width * 0.22, -height * 0.38);
    context.lineTo(width * 0.25, height * 0.38);
    context.stroke();
  }

  private drawWear(width: number, height: number, phase: number, type: StationType): void {
    const context = this.spriteContext;
    context.strokeStyle = type === 'pirate' ? 'rgba(167, 96, 55, .42)' : 'rgba(132, 82, 53, .22)';
    context.lineWidth = 1;
    for (let index = 0; index < 3; index += 1) {
      const x = Math.sin(phase + index * 1.7) * width * 0.34;
      const y = Math.cos(phase * 1.3 + index * 1.1) * height * 0.32;
      context.beginPath();
      context.moveTo(x - width * 0.08, y);
      context.lineTo(x + width * 0.08, y + height * 0.06);
      context.stroke();
    }
  }

  private drawServiceDetails(
    layout: StationLayout,
    radius: number,
    type: StationType
  ): void {
    const context = this.spriteContext;
    context.strokeStyle =
      type === 'pirate' ? 'rgba(163, 94, 56, .55)' : 'rgba(79, 124, 132, .62)';
    context.lineWidth = Math.max(1, radius * 0.012);

    for (let index = 0; index < layout.modules.length - 1; index += 2) {
      const first = layout.modules[index]!;
      const second = layout.modules[index + 1]!;
      context.beginPath();
      context.moveTo(first.x * radius, first.y * radius);
      context.quadraticCurveTo(
        (first.x + second.x) * radius * 0.2,
        (first.y + second.y) * radius * 0.2,
        second.x * radius,
        second.y * radius
      );
      context.stroke();
    }

    context.fillStyle = type === 'pirate' ? '#d28a61' : '#9bd6d9';
    for (const arm of layout.arms) {
      const distance = radius * Math.min(0.86, arm.length + 0.04);
      context.beginPath();
      context.arc(
        Math.cos(arm.angle) * distance,
        Math.sin(arm.angle) * distance,
        Math.max(1.2, radius * 0.012),
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }

  private applyDirectionalLight(
    radius: number,
    rotationRadians: number,
    light?: WorldPoint
  ): void {
    if (!light) return;

    const context = this.spriteContext;
    const localLight = normalize(rotate(light, -rotationRadians));
    const gradient = context.createLinearGradient(
      localLight.x * radius,
      localLight.y * radius,
      -localLight.x * radius,
      -localLight.y * radius
    );
    gradient.addColorStop(0, 'rgba(255,255,255,.13)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.65, 'rgba(0,0,0,.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,.55)');

    context.save();
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }

  private polygon(radius: number, sides: number): void {
    const context = this.spriteContext;
    context.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = -Math.PI / 2 + (index / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }
}
