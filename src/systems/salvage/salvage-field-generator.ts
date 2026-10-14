import type {
  SalvageField,
  SalvageResourceDeposit,
  SalvageWreck,
  SalvageWreckKind,
  SalvageWreckQuality,
  SalvageContainerVariant,
} from '../../core/salvage-types';

const COMMON_RESOURCES = ['steel', 'composite-plate', 'machine-parts'] as const;
const GOOD_RESOURCES = ['electronics', 'ship-parts', 'industrial-ceramics'] as const;
const PREMIUM_RESOURCES = ['reactor-parts', 'processor-modules', 'rare-tech'] as const;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function qualityFromRoll(roll: number, dangerLevel: number): SalvageWreckQuality {
  const adjusted = roll + Math.max(0, dangerLevel) * 0.08;
  if (adjusted >= 0.82) return 3;
  if (adjusted >= 0.45) return 2;
  return 1;
}

function wreckKind(roll: number): SalvageWreckKind {
  if (roll < 0.4) return 'freighter';
  if (roll < 0.62) return 'miner';
  if (roll < 0.82) return 'salvager';
  return 'patrol';
}

function containerName(variant: SalvageContainerVariant, index: number): string {
  const label = {
    standard: 'Frachtcontainer',
    damaged: 'Beschädigter Container',
    tank: 'Tankmodul',
  }[variant];
  return `${label} ${String(index + 1).padStart(2, '0')}`;
}

function resourcePool(quality: SalvageWreckQuality): readonly string[] {
  if (quality === 3) return [...COMMON_RESOURCES, ...GOOD_RESOURCES, ...PREMIUM_RESOURCES];
  if (quality === 2) return [...COMMON_RESOURCES, ...GOOD_RESOURCES];
  return COMMON_RESOURCES;
}

function createResources(
  random: () => number,
  quality: SalvageWreckQuality
): SalvageResourceDeposit[] {
  const pool = [...resourcePool(quality)];
  const count = Math.min(pool.length, quality + 1);
  const deposits: SalvageResourceDeposit[] = [];

  while (deposits.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    const resourceId = pool.splice(index, 1)[0]!;
    const amount = Math.max(2, Math.round(4 + random() * (10 + quality * 10)));
    deposits.push({ resourceId, initialAmount: amount, remainingAmount: amount });
  }
  return deposits;
}

export function generateSalvageField(
  sourceLocationId: string,
  seed: number,
  dangerLevel = 1
): SalvageField {
  const width = 4400;
  const height = 2570;
  const random = createRandom(seed);
  const count = 5 + Math.floor(random() * 4);
  const wrecks: SalvageWreck[] = [];

  for (let index = 0; index < count; index += 1) {
    const quality = qualityFromRoll(random(), dangerLevel);
    const kind = wreckKind(random());
    const variantRoll = random();
    const containerVariant: SalvageContainerVariant =
      variantRoll < 0.46 ? 'standard' : variantRoll < 0.76 ? 'damaged' : 'tank';
    const direction = random() * Math.PI * 2;
    const driftSpeed = 2 + random() * 4;
    wrecks.push({
      id: `wreck-${seed}-${index}`,
      name: containerName(containerVariant, index),
      kind,
      quality,
      containerVariant,
      driftVelocity: { x: Math.cos(direction) * driftSpeed, y: Math.sin(direction) * driftSpeed },
      rotation3d: { x: random() * 0.5, y: random() * 0.5, z: random() * Math.PI * 2 },
      spin3d: { x: 0.04 + random() * 0.09, y: 0.035 + random() * 0.08, z: 0.02 + random() * 0.045 },

      position: {
        x: width * (0.12 + random() * 0.76),
        y: height * (0.12 + random() * 0.76),
      },
      radius: 34 + random() * 42,
      rotation: random() * Math.PI * 2,
      integrity: Math.round(30 + random() * 65),
      resources: createResources(random, quality),
      component: null,
      componentStatus: 'none',
      inspected: false,
    });
  }

  return {
    id: `${sourceLocationId}-salvage-${seed}`,
    sourceLocationId,
    seed,
    width,
    height,
    wrecks,
  };
}
