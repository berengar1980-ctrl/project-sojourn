import { COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT } from '../../core/combat-map-dimensions';
import type {
  SalvageField,
  SalvageResourceDeposit,
  SalvageWreck,
  SalvageWreckKind,
  SalvageWreckQuality,
  SalvageContainerVariant,
  SalvageDebris,
  SalvageDebrisVariant,
  SalvageSection,
  SalvageSectionVariant,
} from '../../core/salvage-types';
import { seededLocalGate } from '../../core/local-space-exit';

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
  dangerLevel = 1,
  density: 'moderate' | 'standard' = 'standard'
): SalvageField {
  const width = COMBAT_MAP_WIDTH;
  const height = COMBAT_MAP_HEIGHT;
  const random = createRandom(seed);
  const count = 5 + Math.floor(random() * 4);
  const wrecks: SalvageWreck[] = [];
  // Each map guarantees all three silhouettes. Shuffle the guaranteed set
  // rather than letting small 5-8 object fields hide tank/damaged variants.
  const guaranteedVariants: SalvageContainerVariant[] = ['standard', 'damaged', 'tank'];
  for (let i = guaranteedVariants.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [guaranteedVariants[i], guaranteedVariants[j]] = [
      guaranteedVariants[j]!,
      guaranteedVariants[i]!,
    ];
  }

  for (let index = 0; index < count; index += 1) {
    const quality = qualityFromRoll(random(), dangerLevel);
    const kind = wreckKind(random());
    const variantRoll = random();
    const containerVariant: SalvageContainerVariant =
      guaranteedVariants[index] ??
      (variantRoll < 1 / 3 ? 'standard' : variantRoll < 2 / 3 ? 'damaged' : 'tank');
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
      radius: 11.5 + random() * 14,
      rotation: random() * Math.PI * 2,
      integrity: Math.round(30 + random() * 65),
      resources: createResources(random, quality),
      component: null,
      componentStatus: 'none',
      inspected: false,
      scanLevel: 'unscanned',
    });
  }

  addSalvageSections(random, seed, dangerLevel, width, height, wrecks, density);
  const debris = generateSalvageDebris(random, seed, dangerLevel, width, height, wrecks, density);

  return {
    debris,
    // Large sections are now part of wrecks, not a second, unclickable
    // visual-only collection; one object owns its pose, physics and loot.
    id: `${sourceLocationId}-salvage-${seed}`,
    sourceLocationId,
    seed,
    width,
    height,
    wrecks,
  };
}

function salvageSectionName(variant: SalvageSectionVariant): string {
  return {
    'corridor-complex': 'Korridor- und Raumsektion',
    'double-deck': 'Doppeldeck-Wrack',
    'engine-room': 'Maschinenraum-Wrack',
    'cargo-bay': 'Frachter-Laderaum',
    'crew-quarters': 'Mannschaftsquartiere',
    bridge: 'Brückensektion',
    'reactor-hall': 'Reaktorhalle',
    medbay: 'Medizinmodul',
  }[variant];
}

function addSalvageSections(
  random: () => number,
  seed: number,
  dangerLevel: number,
  width: number,
  height: number,
  wrecks: SalvageWreck[],
  density: 'moderate' | 'standard'
): void {
  const gate = seededLocalGate(width, height, seed);
  const sectionVariants: readonly SalvageSectionVariant[] = [
    'corridor-complex',
    'double-deck',
    'engine-room',
    'cargo-bay',
    'crew-quarters',
    'bridge',
    'reactor-hall',
    'medbay',
  ];
  const sections: SalvageSection[] = [];
  // One of each large, open, multi-room 3D section is guaranteed per map.
  const sectionCount =
    density === 'moderate' ? 3 + Math.floor(random() * 2) : 8 + Math.floor(random() * 4);
  for (let index = 0; index < sectionCount; index += 1) {
    const variant = sectionVariants[index] ?? sectionVariants[Math.floor(random() * 8)]!;
    // Keep the established large-section scale, with a per-section ±25% variation.
    const baseRadius = 86 + random() * 46;
    const radius = baseRadius * (0.75 + random() * 0.5);
    let position = { x: width / 2, y: height / 2 };
    for (let attempt = 0; attempt < 140; attempt += 1) {
      const candidate = {
        x: radius + 90 + random() * (width - 2 * (radius + 90)),
        y: radius + 90 + random() * (height - 2 * (radius + 90)),
      };
      if (attempt === 0) position = candidate;
      if (Math.hypot(candidate.x - gate.x, candidate.y - gate.y) < radius + 170) continue;
      if (
        wrecks.some(
          (entry) =>
            Math.hypot(candidate.x - entry.position.x, candidate.y - entry.position.y) <
            radius + entry.radius + 36
        )
      )
        continue;
      if (
        sections.some(
          (entry) =>
            Math.hypot(candidate.x - entry.position.x, candidate.y - entry.position.y) <
            radius + entry.radius + 90
        )
      )
        continue;
      position = candidate;
      break;
    }
    const angle = random() * Math.PI * 2;
    const drift = 0.2 + random() * 0.75;
    const section: SalvageSection = {
      id: `section-${seed}-${index}`,
      variant,
      position,
      radius,
      driftVelocity: { x: Math.cos(angle) * drift, y: Math.sin(angle) * drift },
      rotation3d: { x: random() * 0.2, y: random() * 0.2, z: random() * Math.PI * 2 },
      spin3d: {
        x: 0.002 + random() * 0.006,
        y: 0.002 + random() * 0.006,
        z: 0.002 + random() * 0.008,
      },
      effectSeed: Math.floor(random() * 0x7fffffff),
    };
    sections.push(section);
    const quality = qualityFromRoll(random(), dangerLevel);
    wrecks.push({
      id: section.id,
      name: salvageSectionName(variant),
      kind: wreckKind(random()),
      quality,
      sectionVariant: variant,
      effectSeed: section.effectSeed,
      boardingHostiles: 2 + (index % 3),
      position: section.position,
      radius: section.radius,
      rotation: section.rotation3d.z,
      driftVelocity: section.driftVelocity,
      rotation3d: section.rotation3d,
      spin3d: section.spin3d,
      integrity: Math.round(20 + random() * 75),
      resources: createResources(random, quality),
      component: null,
      componentStatus: 'none',
      inspected: false,
      scanLevel: 'unscanned',
    });
  }
}

function generateSalvageDebris(
  random: () => number,
  seed: number,
  dangerLevel: number,
  width: number,
  height: number,
  wrecks: SalvageWreck[],
  density: 'moderate' | 'standard'
): SalvageDebris[] {
  const gate = seededLocalGate(width, height, seed);
  // Keep all eight small-fragment silhouettes. Some are salvageable, while the
  // rest remain dynamic scenery and tractor-throw ammunition.
  const variants: readonly SalvageDebrisVariant[] = [
    'corridor',
    'deck',
    'airlock',
    'truss',
    'engine',
    'reactor',
    'bulkhead',
    'habitation',
  ];
  const debris: SalvageDebris[] = [];
  // Roughly 20-25% fewer small fragments, counterbalanced by more varied sizes.
  const debrisCount =
    density === 'moderate' ? 48 + Math.floor(random() * 12) : 140 + Math.floor(random() * 25);
  for (let index = 0; index < debrisCount; index += 1) {
    const variant = variants[index] ?? variants[Math.floor(random() * variants.length)]!;
    // Each small fragment can grow to twice its previous individual size.
    const baseRadius = 7 + random() * 22;
    const radius = baseRadius * (1 + random());
    let position = { x: width / 2, y: height / 2 };
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const candidate = {
        x: width * (0.08 + random() * 0.84),
        y: height * (0.08 + random() * 0.84),
      };
      if (attempt === 0) position = candidate;
      const clearOfGate = Math.hypot(candidate.x - gate.x, candidate.y - gate.y) > 240;
      const clearOfContainers = wrecks.every(
        (wreck) =>
          Math.hypot(candidate.x - wreck.position.x, candidate.y - wreck.position.y) >
          radius + wreck.radius + 65
      );
      const clearOfDebris = debris.every(
        (part) =>
          Math.hypot(candidate.x - part.position.x, candidate.y - part.position.y) >
          radius + part.radius + 65
      );
      if (!clearOfGate || !clearOfContainers || !clearOfDebris) continue;
      position = candidate;
      break;
    }
    const direction = random() * Math.PI * 2;
    const speed = 0.9 + random() * 2.5;
    const part: SalvageDebris = {
      id: `debris-${seed}-${index}`,
      variant,
      position,
      radius,
      driftVelocity: { x: Math.cos(direction) * speed, y: Math.sin(direction) * speed },
      rotation3d: { x: random() * 0.5, y: random() * 0.5, z: random() * Math.PI * 2 },
      spin3d: {
        x: 0.014 + random() * 0.04,
        y: 0.013 + random() * 0.04,
        z: 0.011 + random() * 0.03,
      },
      effectSeed: Math.floor(random() * 0x7fffffff),
    };
    // Some scrap fragments are real salvage targets, like resource asteroids;
    // other fragments are light, tractor-throwable ambient debris.
    if (index % 3 === 0) {
      const quality = qualityFromRoll(random(), dangerLevel);
      wrecks.push({
        id: part.id,
        name: 'Schiffsfragment ' + String(index + 1).padStart(3, '0'),
        kind: wreckKind(random()),
        quality,
        debrisVariant: variant,
        effectSeed: part.effectSeed,
        position: part.position,
        radius: part.radius,
        rotation: part.rotation3d.z,
        driftVelocity: part.driftVelocity,
        rotation3d: part.rotation3d,
        spin3d: part.spin3d,
        integrity: Math.round(24 + random() * 55),
        resources: createResources(random, quality),
        component: null,
        componentStatus: 'none',
        inspected: false,
        scanLevel: 'unscanned',
      });
    } else {
      debris.push(part);
    }
  }

  return debris;
}
