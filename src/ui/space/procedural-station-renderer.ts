import type { StationType, WorldPoint } from '../../core/world-types';

export type StationDetailLevel = 'map' | 'dock';

interface StationDrawOptions {
  readonly id: string;
  readonly type: StationType;
  readonly point: WorldPoint;
  readonly radius: number;
  readonly detailLevel: StationDetailLevel;
  readonly light?: WorldPoint;
}

type StationModuleKind =
  | 'habitat'
  | 'cargo'
  | 'tank'
  | 'dock'
  | 'radiator'
  | 'sensor'
  | 'armor'
  | 'utility';

interface StationArm {
  readonly angle: number;
  readonly length: number;
  readonly width: number;
}

interface StationModule {
  readonly kind: StationModuleKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly phase: number;
}

interface StationLayout {
  readonly rotation: number;
  readonly coreRadius: number;
  readonly ringRadius: number;
  readonly arms: readonly StationArm[];
  readonly modules: readonly StationModule[];
}

interface StationProfile {
  readonly armMin: number;
  readonly armMax: number;
  readonly coreScale: number;
  readonly ringScale: number;
  readonly moduleKinds: readonly StationModuleKind[];
  readonly moduleMin: number;
  readonly moduleMax: number;
  readonly irregularity: number;
}

const PROFILES: Readonly<Record<StationType, StationProfile>> = {
  trade: {
    armMin: 4,
    armMax: 6,
    coreScale: 0.28,
    ringScale: 0.55,
    moduleKinds: ['dock', 'cargo', 'cargo', 'habitat', 'utility', 'sensor'],
    moduleMin: 7,
    moduleMax: 10,
    irregularity: 0.12,
  },
  shipyard: {
    armMin: 3,
    armMax: 5,
    coreScale: 0.24,
    ringScale: 0.48,
    moduleKinds: ['dock', 'dock', 'dock', 'utility', 'cargo', 'radiator'],
    moduleMin: 7,
    moduleMax: 10,
    irregularity: 0.16,
  },
  military: {
    armMin: 3,
    armMax: 4,
    coreScale: 0.34,
    ringScale: 0.48,
    moduleKinds: ['armor', 'armor', 'sensor', 'utility', 'dock'],
    moduleMin: 6,
    moduleMax: 8,
    irregularity: 0.07,
  },
  refinery: {
    armMin: 4,
    armMax: 5,
    coreScale: 0.27,
    ringScale: 0.5,
    moduleKinds: ['tank', 'tank', 'tank', 'radiator', 'cargo', 'dock'],
    moduleMin: 8,
    moduleMax: 11,
    irregularity: 0.13,
  },
  research: {
    armMin: 3,
    armMax: 5,
    coreScale: 0.24,
    ringScale: 0.48,
    moduleKinds: ['sensor', 'sensor', 'radiator', 'habitat', 'utility', 'dock'],
    moduleMin: 6,
    moduleMax: 9,
    irregularity: 0.1,
  },
  pirate: {
    armMin: 3,
    armMax: 6,
    coreScale: 0.26,
    ringScale: 0.44,
    moduleKinds: ['cargo', 'tank', 'dock', 'utility', 'armor', 'habitat'],
    moduleMin: 7,
    moduleMax: 12,
    irregularity: 0.28,
  },
  utility: {
    armMin: 3,
    armMax: 4,
    coreScale: 0.27,
    ringScale: 0.46,
    moduleKinds: ['utility', 'habitat', 'dock', 'cargo', 'sensor'],
    moduleMin: 5,
    moduleMax: 8,
    irregularity: 0.12,
  },
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
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

  constructor(private readonly context: CanvasRenderingContext2D) {}

  draw(options: StationDrawOptions): void {
    const layout = this.layout(options.id, options.type);
    const context = this.context;
    const dockDetail = options.detailLevel === 'dock';

    context.save();
    context.translate(options.point.x, options.point.y);
    context.rotate(layout.rotation);

    this.drawArms(layout, options.radius, dockDetail);
    this.drawRing(layout, options.radius, options.type, dockDetail);

    for (const module of layout.modules) {
      this.drawModule(module, options.radius, options.type, dockDetail);
    }

    this.drawCore(layout, options.radius, options.type, dockDetail);
    if (dockDetail) this.drawServiceDetails(layout, options.radius, options.type);
    this.applyDirectionalLight(options.radius, layout.rotation, options.light);
    context.restore();
  }

  private layout(id: string, type: StationType): StationLayout {
    const key = id + ':' + type;
    const cached = this.layouts.get(key);
    if (cached) return cached;

    const profile = PROFILES[type];
    const random = createRandom(hashSeed(key));
    const armCount = randomInt(random, profile.armMin, profile.armMax);
    const arms: StationArm[] = [];
    for (let index = 0; index < armCount; index += 1) {
      const base = (index / armCount) * Math.PI * 2;
      const angle = base + (random() - 0.5) * profile.irregularity * 1.7;
      arms.push({
        angle,
        length: 0.48 + random() * 0.3,
        width: 0.045 + random() * 0.035,
      });
    }

    const modules: StationModule[] = [];
    const moduleCount = randomInt(random, profile.moduleMin, profile.moduleMax);
    for (let index = 0; index < moduleCount; index += 1) {
      const arm = arms[index % arms.length]!;
      const radial = 0.38 + random() * 0.45;
      const lateral = (random() - 0.5) * profile.irregularity * 0.65;
      const tangentX = -Math.sin(arm.angle);
      const tangentY = Math.cos(arm.angle);
      modules.push({
        kind: pick(random, profile.moduleKinds),
        x: Math.cos(arm.angle) * radial + tangentX * lateral,
        y: Math.sin(arm.angle) * radial + tangentY * lateral,
        width: 0.11 + random() * 0.11,
        height: 0.08 + random() * 0.13,
        rotation: arm.angle + (random() - 0.5) * profile.irregularity * 1.8,
        phase: random() * Math.PI * 2,
      });
    }

    const layout: StationLayout = {
      rotation: (random() - 0.5) * Math.PI * 0.65,
      coreRadius: profile.coreScale,
      ringRadius: profile.ringScale,
      arms,
      modules,
    };
    this.layouts.set(key, layout);
    return layout;
  }

  private drawArms(layout: StationLayout, radius: number, dockDetail: boolean): void {
    const context = this.context;
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
    const context = this.context;
    if (type === 'shipyard' || type === 'pirate') return;

    const ringRadius = radius * layout.ringRadius;
    context.strokeStyle = type === 'military' ? '#68767d' : '#74898f';
    context.lineWidth = Math.max(dockDetail ? 4 : 1.2, radius * 0.055);
    context.beginPath();
    context.arc(0, 0, ringRadius, 0, Math.PI * 2);
    context.stroke();

    if (dockDetail) {
      context.strokeStyle = 'rgba(173, 187, 188, .3)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(0, 0, ringRadius * 0.9, 0, Math.PI * 2);
      context.stroke();
    }
  }

  private drawCore(
    layout: StationLayout,
    radius: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.context;
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

    context.fillStyle = '#182126';
    context.beginPath();
    context.arc(0, 0, coreRadius * 0.32, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(176, 203, 207, .5)';
    context.lineWidth = Math.max(0.8, radius * 0.012);
    context.beginPath();
    context.arc(0, 0, coreRadius * 0.5, 0, Math.PI * 2);
    context.stroke();

    if (dockDetail) {
      context.strokeStyle = 'rgba(55, 65, 68, .72)';
      context.lineWidth = 1;
      for (let index = 0; index < sides; index += 1) {
        const angle = (index / sides) * Math.PI * 2;
        context.beginPath();
        context.moveTo(
          Math.cos(angle) * coreRadius * 0.55,
          Math.sin(angle) * coreRadius * 0.55
        );
        context.lineTo(
          Math.cos(angle) * coreRadius * 0.9,
          Math.sin(angle) * coreRadius * 0.9
        );
        context.stroke();
      }
    }
  }

  private drawModule(
    module: StationModule,
    radius: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.context;
    const x = module.x * radius;
    const y = module.y * radius;
    const width = module.width * radius;
    const height = module.height * radius;

    context.save();
    context.translate(x, y);
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
    const context = this.context;
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
    if (kind === 'habitat') {
      context.fillStyle = 'rgba(203, 225, 173, .75)';
      for (let index = 0; index < 3; index += 1) {
        context.fillRect(-width * 0.3 + index * width * 0.28, -1, 2, 2);
      }
    }
  }

  private drawTank(
    width: number,
    height: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.context;
    const radiusX = Math.max(width * 0.48, 2);
    const radiusY = Math.max(height * 0.48, 2);
    context.fillStyle = type === 'pirate' ? '#6b5848' : '#66777a';
    context.strokeStyle = type === 'pirate' ? '#a27b5a' : '#9cacaa';
    context.beginPath();
    context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (dockDetail) {
      context.strokeStyle = 'rgba(36, 46, 49, .85)';
      for (const fraction of [-0.42, 0, 0.42]) {
        context.beginPath();
        context.moveTo(fraction * radiusX, -radiusY * 0.88);
        context.lineTo(fraction * radiusX, radiusY * 0.88);
        context.stroke();
      }
    }
  }

  private drawDock(
    width: number,
    height: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.context;
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

    if (dockDetail) {
      context.fillStyle = '#d5b36d';
      context.fillRect(width * 0.38, -height * 0.32, 2, 2);
      context.fillRect(width * 0.38, height * 0.28, 2, 2);
    }
  }

  private drawRadiator(width: number, height: number, dockDetail: boolean): void {
    const context = this.context;
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
    const context = this.context;
    context.strokeStyle = '#9bb1b5';
    context.lineWidth = Math.max(1, Math.min(width, height) * 0.08);
    context.beginPath();
    context.moveTo(-width * 0.4, 0);
    context.lineTo(width * 0.2, 0);
    context.stroke();
    context.beginPath();
    context.arc(width * 0.26, 0, Math.max(2, height * 0.35), -1.15, 1.15);
    context.stroke();

    if (dockDetail) {
      context.strokeStyle = 'rgba(125, 204, 219, .6)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(width * 0.26, 0, Math.max(3, height * 0.48), -0.9, 0.9);
      context.stroke();
    }
  }

  private drawCargo(
    width: number,
    height: number,
    type: StationType,
    dockDetail: boolean
  ): void {
    const context = this.context;
    const columns = dockDetail ? 3 : 2;
    const gap = Math.max(1, width * 0.04);
    const unitWidth = (width - gap * (columns - 1)) / columns;
    for (let index = 0; index < columns; index += 1) {
      const x = -width / 2 + index * (unitWidth + gap);
      context.fillStyle =
        type === 'pirate' ? (index % 2 === 0 ? '#625245' : '#514b48') : '#56666b';
      context.strokeStyle = type === 'pirate' ? '#98755b' : '#82969a';
      context.fillRect(x, -height / 2, unitWidth, height);
      context.strokeRect(x, -height / 2, unitWidth, height);
    }
  }

  private drawArmor(width: number, height: number, dockDetail: boolean): void {
    const context = this.context;
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

    if (dockDetail) {
      context.strokeStyle = 'rgba(35, 44, 48, .8)';
      context.beginPath();
      context.moveTo(-width * 0.22, -height * 0.38);
      context.lineTo(width * 0.25, height * 0.38);
      context.stroke();
    }
  }

  private drawWear(
    width: number,
    height: number,
    phase: number,
    type: StationType
  ): void {
    const context = this.context;
    context.strokeStyle =
      type === 'pirate' ? 'rgba(167, 96, 55, .42)' : 'rgba(132, 82, 53, .22)';
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
    const context = this.context;

    context.strokeStyle = type === 'pirate' ? 'rgba(163, 94, 56, .55)' : 'rgba(79, 124, 132, .62)';
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
      const x = Math.cos(arm.angle) * radius * Math.min(0.86, arm.length + 0.04);
      const y = Math.sin(arm.angle) * radius * Math.min(0.86, arm.length + 0.04);
      context.beginPath();
      context.arc(x, y, Math.max(1.2, radius * 0.012), 0, Math.PI * 2);
      context.fill();
    }
  }

  private applyDirectionalLight(
    radius: number,
    rotationRadians: number,
    light?: WorldPoint
  ): void {
    if (!light) return;
    const context = this.context;
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
    const context = this.context;
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
