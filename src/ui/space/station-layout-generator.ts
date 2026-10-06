import type { StationType } from '../../core/world-types';

export type StationModuleKind =
  | 'habitat'
  | 'cargo'
  | 'tank'
  | 'dock'
  | 'radiator'
  | 'sensor'
  | 'armor'
  | 'utility';

export interface StationArmLayout {
  readonly angle: number;
  readonly length: number;
  readonly width: number;
}

export interface StationModuleLayout {
  readonly kind: StationModuleKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly phase: number;
}

export interface StationLayout {
  readonly rotation: number;
  readonly coreRadius: number;
  readonly ringRadius: number;
  readonly arms: readonly StationArmLayout[];
  readonly modules: readonly StationModuleLayout[];
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

export function createStationLayout(id: string, type: StationType): StationLayout {
  const profile = PROFILES[type];
  const random = createRandom(hashSeed(id + ':' + type));
  const armCount = randomInt(random, profile.armMin, profile.armMax);
  const arms: StationArmLayout[] = [];

  for (let index = 0; index < armCount; index += 1) {
    const base = (index / armCount) * Math.PI * 2;
    const angle = base + (random() - 0.5) * profile.irregularity * 1.7;
    arms.push({
      angle,
      length: 0.48 + random() * 0.3,
      width: 0.045 + random() * 0.035,
    });
  }

  const modules: StationModuleLayout[] = [];
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

  return {
    rotation: (random() - 0.5) * Math.PI * 0.65,
    coreRadius: profile.coreScale,
    ringRadius: profile.ringScale,
    arms,
    modules,
  };
}
