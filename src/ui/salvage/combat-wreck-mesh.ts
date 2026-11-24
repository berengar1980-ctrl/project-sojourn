import type { CombatWreckVariant } from '../../core/salvage-types';
import { drawCachedSalvageMesh } from './salvage-mesh-lod-cache';
import { ContainerMesh, drawProjectedSalvageMesh, type Face } from './salvage-container-mesh';
import { C, fragment, ribs, scatter, shell, soot, strut } from './combat-wreck-geometry';
import { addCombatWreckDetail } from './combat-wreck-details';

function freighter(m: ContainerMesh): void {
  // Large freight spine with its forward section ripped open.
  shell(
    m,
    [
      [-2.9, -0.62],
      [-2.54, -1.01],
      [-1.78, -1.02],
      [-1.58, -0.83],
      [0.1, -0.9],
      [0.92, -0.67],
      [1.06, -0.35],
      [0.55, -0.22],
      [0.89, 0.06],
      [0.6, 0.71],
      [-0.83, 0.84],
      [-1.2, 0.96],
      [-2.66, 0.84],
      [-2.97, 0.33],
    ],
    -0.35,
    0.48,
    C.hull
  );
  shell(
    m,
    [
      [-2.65, -0.61],
      [-1.02, -0.71],
      [-0.7, -0.36],
      [-1.05, 0.14],
      [-2.53, 0.48],
    ],
    0.49,
    0.59,
    C.plate
  );
  ribs(m, -0.1, 1.28, 1.42, 7);
  for (const y of [-0.48, 0.48]) m.cylinder(-2.78, y, -0.16, 0.6, 0.25, C.dark);
  strut(m, 0.4, -0.52, 1.84, -0.8, 0.39, 0.09);
  strut(m, 0.15, 0.45, 1.54, 0.96, 0.34, 0.07);
  soot(m, -0.55, 0.42, 0.82);
  fragment(m, 1.83, 0.92, 1.18, 0.38, C.iron);
  fragment(m, 2.4, -0.42, 0.88, -0.74, C.dark);
  fragment(m, -1.33, 1.85, 0.93, 0.7, C.hull);
  scatter(m, 12, 2.55, 0.2);
}
function patrol(m: ContainerMesh): void {
  // Narrow interceptor, torn wing on one side and fractured engine cluster.
  shell(
    m,
    [
      [-2.5, -0.37],
      [-1.96, -0.53],
      [-0.95, -0.44],
      [-0.43, -0.3],
      [1.13, -0.28],
      [2.36, 0],
      [1.13, 0.3],
      [-0.39, 0.43],
      [-1.57, 0.53],
      [-2.56, 0.38],
    ],
    -0.27,
    0.4,
    C.hull
  );
  shell(
    m,
    [
      [-1.8, -0.48],
      [-0.36, -1.31],
      [0.68, -1.7],
      [0.94, -1.27],
      [-0.23, -0.42],
    ],
    -0.19,
    0.15,
    C.iron
  );
  shell(
    m,
    [
      [-1.8, -0.17],
      [-1.18, -0.2],
      [0.7, 0.18],
      [0.1, 0.46],
      [-1.8, 0.41],
    ],
    0.41,
    0.54,
    C.plate
  );
  ribs(m, 0.54, 1.64, 0.54, 5);
  m.cylinder(-2.4, 0, 0, 0.72, 0.27, C.dark);
  soot(m, 0.3, 0.3, 0.68);
  // Port wing is entirely separate.
  fragment(m, -0.06, 1.92, 1.8, -0.35, C.hull);
  strut(m, -0.8, 0.49, -0.17, 0.98, 0.3, 0.07);
  fragment(m, 2.3, -1.32, 0.82, 0.8, C.dark);
  fragment(m, -2.55, -1.6, 0.7, 0.35, C.iron);
  scatter(m, 14, 2.65, 1.12);
}
function oreCarrier(m: ContainerMesh): void {
  shell(
    m,
    [
      [-2.7, -0.76],
      [-2.41, -1],
      [-1.12, -0.89],
      [0.26, -0.94],
      [1.29, -0.74],
      [1.49, -0.3],
      [0.83, 0.04],
      [1.51, 0.37],
      [0.97, 0.94],
      [-0.7, 0.82],
      [-2.63, 0.7],
    ],
    -0.4,
    0.36,
    C.hull
  );
  for (const y of [-0.93, 0.93]) {
    for (const x of [-1.65, -0.55, 0.45]) {
      m.cylinder(x, y, -0.08, 0.87, 0.37, C.dark);
      m.cylinder(x - 0.31, y, -0.08, 0.11, 0.39, C.steel);
    }
  }
  ribs(m, -2.1, 0.87, 1.5, 8);
  soot(m, -0.72, 0.3, 1.04);
  strut(m, 1.13, -0.37, 2.2, -0.88, 0.32, 0.075);
  strut(m, 1.08, 0.47, 2.48, 0.97, 0.28, 0.075);
  fragment(m, 1.46, 1.73, 1.45, 0.41, C.iron);
  fragment(m, 2.48, -0.71, 1.17, -0.9, C.hull);
  fragment(m, -2.03, -1.84, 0.98, 0.67, C.dark);
  scatter(m, 14, 2.66, 0.6);
}
function splitHull(m: ContainerMesh): void {
  // A clean open gap between the violently separated stern and prow.
  shell(
    m,
    [
      [-3.12, -0.65],
      [-2.72, -0.97],
      [-1.42, -0.8],
      [-1.07, -0.46],
      [-1.51, -0.1],
      [-1.01, 0.22],
      [-1.57, 0.81],
      [-2.89, 0.74],
      [-3.1, 0.37],
    ],
    -0.42,
    0.43,
    C.hull
  );
  shell(
    m,
    [
      [0.94, -0.48],
      [1.42, -0.84],
      [2.4, -0.62],
      [3.02, -0.13],
      [2.89, 0.45],
      [2.22, 0.73],
      [1.27, 0.81],
      [0.79, 0.3],
      [1.15, -0.05],
    ],
    -0.31,
    0.45,
    C.iron
  );
  shell(
    m,
    [
      [-2.87, -0.6],
      [-1.77, -0.66],
      [-1.52, -0.26],
      [-2.72, 0.48],
    ],
    0.45,
    0.56,
    C.plate
  );
  shell(
    m,
    [
      [1.47, -0.51],
      [2.29, -0.36],
      [2.51, 0.29],
      [1.58, 0.52],
    ],
    0.46,
    0.55,
    C.plate
  );
  for (const y of [-0.49, 0.49]) m.cylinder(-2.95, y, -0.11, 0.59, 0.24, C.dark);
  ribs(m, -1.52, -0.84, 1.12, 5);
  ribs(m, 0.73, 1.44, 1.22, 5);
  for (let i = 0; i < 8; i++)
    strut(
      m,
      -0.94,
      (i - 3.5) * 0.18,
      0.57,
      (i - 3.5) * 0.17,
      0.22,
      0.025,
      i % 2 ? C.dark : C.steel
    );
  soot(m, 1.85, 0.1, 0.73);
  fragment(m, 0.15, 1.56, 1.1, 0.7, C.hull);
  fragment(m, -0.4, -1.7, 0.91, -0.35, C.dark);
  scatter(m, 13, 2.6, 2.45);
}
function barge(m: ContainerMesh): void {
  // Irregular, deliberately non-rectangular salvage craft.
  shell(
    m,
    [
      [-2.51, -0.37],
      [-2.13, -0.8],
      [-1.48, -0.64],
      [-0.94, -0.9],
      [-0.27, -0.63],
      [0.38, -0.86],
      [1.22, -0.58],
      [1.6, -0.28],
      [1.16, 0.23],
      [1.79, 0.6],
      [0.94, 0.78],
      [0.15, 0.59],
      [-0.7, 0.94],
      [-1.24, 0.53],
      [-2.03, 0.65],
      [-2.46, 0.14],
    ],
    -0.3,
    0.38,
    C.dark
  );
  shell(
    m,
    [
      [-1.79, -0.34],
      [-1.15, -0.67],
      [-0.44, -0.41],
      [0.42, -0.52],
      [0.82, -0.12],
      [0.51, 0.32],
      [-0.15, 0.43],
      [-0.8, 0.7],
      [-1.55, 0.28],
    ],
    0.4,
    0.51,
    C.iron
  );
  for (let i = 0; i < 6; i++)
    strut(
      m,
      -1.67 + i * 0.51,
      -0.66,
      -1.39 + i * 0.49,
      0.77,
      0.54,
      0.045,
      i % 2 ? C.steel : C.char
    );
  // Broken asymmetric grappling booms, spread out rather than box wings.
  strut(m, -0.85, 0.5, -2.02, 1.56, 0.23, 0.075);
  strut(m, -1.53, 0.46, -2.35, 1.33, 0.25, 0.04);
  strut(m, 0.76, -0.31, 2.46, -1.47, 0.22, 0.08);
  strut(m, 1.16, -0.03, 2.23, -1.21, 0.23, 0.042);
  strut(m, 0.97, 0.46, 2.12, 1.33, 0.27, 0.07);
  fragment(m, -1.91, 1.71, 1.03, -0.47, C.hull);
  fragment(m, 2.23, -1.52, 0.98, 0.25, C.iron);
  fragment(m, 2.56, 0.92, 0.68, 0.82, C.dark);
  fragment(m, -2.45, -1.24, 0.84, -0.7, C.steel);
  soot(m, -0.51, 0.2, 1.06);
  soot(m, 1.11, 0.16, 0.5);
  scatter(m, 16, 2.63, 1.6);
}

const BUILDERS = {
  'fractured-freighter': freighter,
  'shattered-patrol': patrol,
  'ore-carrier': oreCarrier,
  'split-hull': splitHull,
  'salvage-barge': barge,
} as const;

type NewVariant = keyof typeof BUILDERS;
const LEGACY: Readonly<Record<CombatWreckVariant, NewVariant>> = {
  'fractured-freighter': 'fractured-freighter',
  'shattered-patrol': 'shattered-patrol',
  'ore-carrier': 'ore-carrier',
  'split-hull': 'split-hull',
  'salvage-barge': 'salvage-barge',
  miner: 'ore-carrier',
  freighter: 'fractured-freighter',
  patrol: 'shattered-patrol',
};

function make(variant: NewVariant): readonly Face[] {
  const m = new ContainerMesh();
  BUILDERS[variant](m);
  addCombatWreckDetail(m, Object.keys(BUILDERS).indexOf(variant));
  return m.faces;
}
const meshes: Readonly<Record<NewVariant, readonly Face[]>> = {
  'fractured-freighter': make('fractured-freighter'),
  'shattered-patrol': make('shattered-patrol'),
  'ore-carrier': make('ore-carrier'),
  'split-hull': make('split-hull'),
  'salvage-barge': make('salvage-barge'),
};

// Five independent chunks, separate from the stationary mesh and its LOD cache.
const driftingParts: readonly (readonly Face[])[] = [
  ...Array.from({ length: 5 }, (_, index) => {
    const m = new ContainerMesh();
    fragment(m, 0, 0, 0.76 - index * 0.065, index * 1.19, index % 2 ? C.iron : C.hull);
    ribs(m, -0.19, 0.17, 0.28, 3);
    return m.faces;
  }),
];

/**
 * Shared animated 3D projection, used only for destroyed ships.
 * Animation clock is visual-only; the physical wreck keeps its single
 * authoritative drift, collision shape and salvage state.
 */
export function drawCombatWreck3d(
  context: CanvasRenderingContext2D,
  variant: CombatWreckVariant,
  radius: number,
  rotation: { x: number; y: number; z: number },
  timeSeconds = performance.now() / 1000,
  effectSeed = 0
): void {
  // Purely visual scale: preserve the authoritative wreck radius/collisions and hit areas.
  const visibleRadius = radius * (2 / 3);
  const current = LEGACY[variant];
  const geometry = meshes[current];
  const phase = effectSeed * 0.000031;
  const animated = {
    x: rotation.x + timeSeconds * 0.115 + phase,
    y: rotation.y + timeSeconds * 0.092 + phase * 0.37,
    z: rotation.z + timeSeconds * 0.068,
  };
  // Small silhouettes use the shared raster atlas. Above 24 screen px
  // project the full-resolution geometry each frame: no angle quantization.
  if (
    visibleRadius >= 24 ||
    !drawCachedSalvageMesh(context, 'combat-wreck-v3:' + current, geometry, visibleRadius, animated, 256)
  ) {
    drawProjectedSalvageMesh(context, geometry, visibleRadius, animated);
  }

  if (visibleRadius < 13) return;
  const rootRotation = animated.z;
  for (let i = 0; i < driftingParts.length; i += 1) {
    const angle = i * 2.399963 + phase * 2.7;
    const w = timeSeconds * (0.17 + i * 0.037) + phase + i * 0.42;
    const reach = visibleRadius * (0.65 + i * 0.073);
    const drift = visibleRadius * 0.15;
    const x = Math.cos(angle + rootRotation) * reach + Math.sin(w) * drift;
    const y = Math.sin(angle + rootRotation) * reach + Math.cos(w * 0.81) * drift;
    context.save();
    context.translate(x, y);
    drawProjectedSalvageMesh(context, driftingParts[i]!, visibleRadius * (0.33 + i * 0.035), {
      x: animated.x + w * (0.71 + i * 0.06),
      y: animated.y + w * (0.48 + i * 0.04),
      z: rootRotation + w * (0.67 - i * 0.045),
    });
    context.restore();
  }
}
