import type { SalvageSection, SalvageSectionVariant } from '../../core/salvage-types';
import { drawCachedSalvageMesh } from './salvage-mesh-lod-cache';
import { ContainerMesh, drawProjectedSalvageMesh, type Color, type Face, type Vec3 } from './salvage-container-mesh';

/**
 * Eight large, open ship sections, made of genuinely 3D floor slabs, standing
 * bulkheads, doorframes and machinery. No textures, sprites or per-instance
 * geometry. Partial upper decks expose the rooms underneath.
 */
const C = {
  floor: [42, 49, 53], wall: [64, 73, 76], edge: [28, 36, 42],
  floorLight: [83, 91, 89], trim: [145, 106, 56], rust: [104, 60, 46],
  steel: [99, 108, 108], dark: [16, 22, 27], cable: [110, 47, 40],
  blue: [42, 74, 91], signal: [75, 143, 134], glass: [29, 46, 56],
  soot: [27, 29, 30], burn: [67, 47, 38], edgeMetal: [126, 115, 98],
} as const satisfies Record<string, Color>;

type DeckHeight = 0 | 1.1;

function floor(m: ContainerMesh, x: number, y: number, w: number, h: number, z: DeckHeight = 0): void {
  m.box(x, y, z - 0.2, w, h, 0.25, C.floor);
  for (let i = -2; i <= 2; i += 1) {
    m.box(x + i * w / 6, y, z - 0.055, 0.025, h * 0.83, 0.02, C.edge);
  }
  for (const edge of [-1, 1]) {
    m.box(x, y + edge * (h / 2 - 0.09), z - 0.045, w * 0.94, 0.055, 0.02, C.trim);
  }
}

function wallX(m: ContainerMesh, x: number, y: number, length: number, z = 0): void {
  m.box(x, y, z + 0.43, 0.16, length, 0.9, C.wall);
  m.box(x, y, z + 0.91, 0.24, length, 0.14, C.steel);
  for (let i = -1; i <= 1; i += 1) {
    m.box(x, y + i * length / 3, z + 0.46, 0.25, 0.055, 0.92, C.edge);
  }
}
function wallY(m: ContainerMesh, x: number, y: number, length: number, z = 0): void {
  m.box(x, y, z + 0.43, length, 0.16, 0.9, C.wall);
  m.box(x, y, z + 0.91, length, 0.23, 0.14, C.steel);
  for (let i = -1; i <= 1; i += 1) {
    m.box(x + i * length / 3, y, z + 0.46, 0.06, 0.25, 0.92, C.edge);
  }
}
function doorY(m: ContainerMesh, x: number, y: number, z = 0, width = 0.62): void {
  m.box(x - width / 2, y, z + 0.54, 0.09, 0.2, 1.1, C.trim);
  m.box(x + width / 2, y, z + 0.54, 0.09, 0.2, 1.1, C.trim);
  m.box(x, y, z + 1.09, width + 0.17, 0.22, 0.14, C.steel);
  m.box(x, y + 0.01, z + 0.11, width - 0.06, 0.20, 0.04, C.dark);
  m.box(x - width * 0.29, y - 0.03, z + 0.49, width * 0.33, 0.085, 0.84, C.wall);
  m.box(x - width * 0.29, y - 0.085, z + 0.56, width * 0.12, 0.06, 0.27, C.glass);
}
function doorX(m: ContainerMesh, x: number, y: number, z = 0): void {
  m.box(x, y - 0.30, z + 0.52, 0.19, 0.09, 1.08, C.trim);
  m.box(x, y + 0.30, z + 0.52, 0.19, 0.09, 1.08, C.trim);
  m.box(x, y, z + 1.08, 0.18, 0.74, 0.13, C.steel);
  m.box(x, y - 0.07, z + 0.43, 0.10, 0.26, 0.84, C.wall);
}
function room(
  m: ContainerMesh,
  x: number,
  y: number,
  w: number,
  h: number,
  z: DeckHeight = 0,
  orientation: 'front' | 'back' | 'left' | 'right' = 'front'
): void {
  floor(m, x, y, w, h, z);
  // Three actual upright walls, fourth side torn away so the inside is visible.
  if (orientation !== 'left') wallX(m, x - w / 2, y, h, z);
  if (orientation !== 'right') wallX(m, x + w / 2, y, h, z);
  if (orientation !== 'front') wallY(m, x, y - h / 2, w, z);
  if (orientation !== 'back') wallY(m, x, y + h / 2, w, z);
  // Reinforcement columns at surviving corners.
  for (const xx of [-1, 1]) for (const yy of [-1, 1]) {
    m.box(x + xx * w * 0.46, y + yy * h * 0.45, z + 0.48, 0.16, 0.16, 1, C.edge);
  }
}
function hatchDivider(m: ContainerMesh, x: number, y: number, total: number, gap = 0.72): void {
  const side = (total - gap) / 2;
  wallY(m, x - (gap + side) / 2, y, side);
  wallY(m, x + (gap + side) / 2, y, side);
  doorY(m, x, y, 0, gap - 0.1);
}
function grille(m: ContainerMesh, x: number, y: number, w: number, h: number, z = 0): void {
  m.box(x, y, z + 0.01, w, h, 0.04, C.dark);
  for (let i = 0; i < 6; i += 1) {
    m.box(x - w / 2 + w * (i + 0.5) / 6, y, z + 0.045, 0.028, h, 0.023, C.steel);
  }
}
function wires(m: ContainerMesh, x: number, y: number, z = 0): void {
  for (let i = 0; i < 4; i += 1) {
    const yy = y + (i - 1.5) * 0.11;
    m.box(x - 0.26, yy, z + 0.42 + i * 0.026, 0.52, 0.046, 0.045, i % 2 ? C.cable : C.blue);
    m.box(x + 0.24, yy + 0.15, z + 0.25, 0.07, 0.37, 0.04, C.cable);
  }
}
function ladder(m: ContainerMesh, x: number, y: number): void {
  for (const dx of [-0.13, 0.13]) m.box(x + dx, y, 0.62, 0.038, 0.42, 1.25, C.steel);
  for (let i = 0; i < 7; i += 1) {
    m.box(x, y - 0.2, 0.07 + i * 0.17, 0.32, 0.045, 0.035, C.trim);
  }
}
function ripped(m: ContainerMesh, x: number, y: number, z = 0): void {
  for (let i = 0; i < 4; i += 1) {
    m.box(x + i * 0.18, y + (i % 2) * 0.16, z + 0.1 + i * 0.11,
      0.37, 0.09, 0.1, i % 2 ? C.steel : C.rust);
  }
}
function machine(m: ContainerMesh, x: number, y: number, size = 0.6, z = 0): void {
  m.box(x, y, z + 0.24, size, size * 0.78, 0.48, C.edge);
  m.box(x, y, z + 0.53, size * 0.7, size * 0.6, 0.11, C.steel);
  m.box(x, y - 0.13 * size, z + 0.61, size * 0.4, 0.05, 0.055, C.blue);
  for (const s of [-1, 1]) {
    m.box(x + s * size * 0.36, y, z + 0.35, 0.085, size * 0.5, 0.26, C.trim);
  }
}
function airleak(m: ContainerMesh, x: number, y: number): void {
  m.box(x, y, 0.4, 0.4, 0.18, 0.2, C.rust);
  m.box(x + 0.24, y, 0.47, 0.19, 0.085, 0.07, C.blue);
}
function scaffolding(m: ContainerMesh, x: number, y: number, length = 1.5): void {
  for (const dy of [-0.18, 0.18]) m.box(x, y + dy, 0.07, length, 0.07, 0.09, C.edge);
  for (let i = 0; i < 5; i += 1) {
    m.box(x - length / 2 + length * i / 4, y, 0.13, 0.07, 0.48, 0.075, C.steel);
  }
}
function controlConsole(m: ContainerMesh, x: number, y: number, z = 0): void {
  machine(m, x, y, 0.58, z);
  m.box(x, y + 0.04, z + 0.64, 0.35, 0.24, 0.06, C.signal);
}

function buildCorridorComplex(m: ContainerMesh): void {
  // Intact central floor, two real adjoining rooms and a damaged blast door.
  room(m, -0.70, -0.08, 1.5, 2.4, 0, 'front');
  room(m, 0.88, -0.65, 1.38, 1.25, 0, 'front');
  room(m, 0.88, 0.71, 1.38, 1.15, 0, 'right');
  doorX(m, 0.07, -0.54);
  doorX(m, 0.07, 0.70);
  grille(m, -0.74, -0.05, 0.62, 1.68);
  machine(m, 1.12, -0.70, 0.47);
  wires(m, 1.14, 1.1);
  ripped(m, -1.53, -1.05);
  scaffolding(m, -0.73, -1.46);
}
function buildDoubleDeck(m: ContainerMesh): void {
  room(m, -0.60, 0.05, 2.15, 2.45, 0, 'front');
  room(m, 0.99, -0.56, 1.05, 1.28, 0, 'right');
  doorX(m, 0.48, -0.47);
  controlConsole(m, -1.05, 0.44);
  grille(m, -0.40, -0.34, 0.8, 0.56);
  // Raised floor only across HALF the module; lower corridor remains visible.
  floor(m, -0.69, 0.65, 1.50, 1.05, 1.1);
  wallX(m, -1.45, 0.66, 1.02, 1.1);
  wallY(m, -0.68, 1.15, 1.46, 1.1);
  m.box(-0.48, 0.11, 1.12, 1.04, 0.10, 0.12, C.trim);
  m.box(-0.50, 0.3, 1.17, 0.2, 0.65, 0.12, C.edge);
  ladder(m, -0.10, -0.11);
  machine(m, -0.86, 0.87, 0.40, 1.1);
  ripped(m, 0.51, 1.21, 1.1);
}
function buildEngineRoom(m: ContainerMesh): void {
  room(m, -0.31, 0.11, 2.88, 2.22, 0, 'front');
  room(m, 1.43, -0.48, 0.84, 1.1, 0, 'right');
  doorX(m, 1.03, -0.52);
  for (const y of [-0.54, 0.54]) {
    m.cylinder(-0.46, y, 0.43, 1.36, 0.36, C.edge);
    for (const x of [-0.91, -0.19]) m.cylinder(x, y, 0.43, 0.09, 0.41, C.steel);
  }
  scaffolding(m, -0.25, 0.0, 1.50);
  wires(m, 1.39, 0.76);
  airleak(m, -1.73, -1.03);
  ripped(m, 1.04, 1.31);
}
function buildCargoHold(m: ContainerMesh): void {
  room(m, -0.35, -0.09, 2.83, 2.31, 0, 'front');
  room(m, 1.37, 0.55, 0.81, 1.0, 0, 'right');
  doorX(m, 0.97, 0.49);
  for (const x of [-1.1, -0.55, 0.0, 0.55]) {
    m.box(x, -0.25, -0.01, 0.07, 1.1, 0.06, C.trim);
  }
  for (const x of [-1.12, -0.18]) machine(m, x, 0.57, 0.47);
  grille(m, 0.52, 0.68, 0.48, 0.57);
  ripped(m, -1.69, -1.19);
  wires(m, 1.12, 1.15);
}
function buildCrewBlock(m: ContainerMesh): void {
  room(m, -0.77, -0.66, 1.31, 1.27, 0, 'front');
  room(m, 0.68, -0.66, 1.34, 1.27, 0, 'front');
  room(m, -0.77, 0.68, 1.31, 1.11, 0, 'front');
  room(m, 0.68, 0.68, 1.34, 1.11, 0, 'right');
  hatchDivider(m, 0.0, 0.0, 2.54);
  doorY(m, -0.74, -0.1);
  doorY(m, 0.65, -0.1);
  for (const x of [-0.95, 0.54]) for (const y of [-0.76, 0.64]) {
    m.box(x, y, 0.16, 0.46, 0.18, 0.34, C.floorLight);
    m.box(x - 0.12, y + 0.10, 0.34, 0.16, 0.13, 0.04, C.blue);
  }
  wires(m, 1.39, 1.16);
  ripped(m, -1.56, 1.12);
}
function buildBridge(m: ContainerMesh): void {
  room(m, 0.42, -0.12, 2.5, 2.31, 0, 'front');
  room(m, -1.28, 0.02, 0.81, 1.43, 0, 'left');
  doorX(m, -0.82, 0);
  for (const x of [-0.36, 0.39, 1.13]) controlConsole(m, x, -0.75);
  for (const x of [-0.2, 0.61]) machine(m, x, 0.52, 0.46);
  m.box(1.46, 0.03, 0.47, 0.16, 1.5, 0.54, C.glass);
  m.box(1.54, 0.02, 0.57, 0.12, 0.95, 0.16, C.blue);
  ripped(m, 1.62, -1.16);
  scaffolding(m, -0.44, 1.18, 1.50);
}
function buildReactorHall(m: ContainerMesh): void {
  room(m, 0.0, 0.0, 3.12, 2.39, 0, 'front');
  room(m, 1.57, 0.45, 0.68, 0.85, 0, 'right');
  doorX(m, 1.25, 0.45);
  m.cylinder(-0.39, 0.15, 0.49, 1.58, 0.42, C.edge);
  for (const x of [-0.94, -0.39, 0.18]) m.cylinder(x, 0.15, 0.49, 0.09, 0.46, C.trim);
  m.box(-0.47, 0.13, 0.89, 0.52, 0.31, 0.08, C.signal);
  scaffolding(m, -0.17, -0.65, 1.88);
  for (const yy of [-0.82, 0.89]) wires(m, 0.74, yy);
  airleak(m, -1.67, 0.92);
  ripped(m, 1.07, -1.19);
}
function buildMedbay(m: ContainerMesh): void {
  room(m, -0.92, 0.0, 1.54, 2.39, 0, 'front');
  room(m, 0.55, -0.69, 1.29, 1.19, 0, 'front');
  room(m, 0.55, 0.66, 1.29, 1.22, 0, 'right');
  doorX(m, -0.17, -0.59);
  doorX(m, -0.17, 0.57);
  for (const y of [-0.57, 0.56]) {
    m.box(0.60, y, 0.23, 0.72, 0.34, 0.46, C.floorLight);
    m.box(0.60, y, 0.48, 0.55, 0.18, 0.05, C.glass);
  }
  controlConsole(m, -1.22, -0.16);
  wires(m, 0.98, 1.18);
  ripped(m, -1.71, -1.13);
}

/** Irregular torn-open roof remnants, not another clean modular box.
 * Roughly 20-35% of the original ceiling remains as overlapping jagged plates.
 * Room floors, doorways and broken wall openings stay visible underneath.
 * All geometry is cached per model, never generated on individual frames.
 */
function tornRoof(m: ContainerMesh, variantIndex: number): void {
  const reversed = variantIndex % 2 === 1 ? -1 : 1;
  const tilt = (variantIndex % 3 - 1) * 0.14;
  const height = variantIndex === 1 ? 2.17 : 1.16;
  const panels: readonly (readonly (readonly [number, number])[])[] = [
    [
      [-1.86, -1.27], [-0.49, -1.32], [-0.19, -0.91],
      [-0.50, -0.77], [-0.32, -0.58], [-0.78, -0.65],
      [-0.94, -0.38], [-1.29, -0.68], [-1.74, -0.48],
    ],
    [
      [0.40, 1.28], [1.88, 1.14], [1.57, 0.81],
      [1.81, 0.55], [1.37, 0.61], [1.10, 0.25],
      [0.91, 0.63], [0.67, 0.48], [0.79, 0.87],
    ],
    [
      [-1.69, 0.76], [-1.00, 0.69], [-0.73, 0.96],
      [-0.91, 1.29], [-1.47, 1.24], [-1.28, 1.08],
    ],
  ];
  panels.forEach((outline, panelIndex) => {
    const z = height + (panelIndex === 1 ? -0.12 : 0.05);
    const shape: Vec3[] = outline.map(([x, y], i): Vec3 => [
      x * reversed + tilt * (panelIndex + 1),
      y + Math.sin(i * 2.7 + variantIndex) * 0.065,
      z + (i % 3) * 0.022,
    ]);
    m.face(shape, [0, 0, 1], panelIndex === 1 ? C.soot : C.wall);
    // Sawtooth exposed thickness, with heat-discolored, twisted plate edges.
    for (let i = 0; i < shape.length; i += 1) {
      const a = shape[i]!;
      const b = shape[(i + 1) % shape.length]!;
      m.face(
        [a, b, [b[0] + 0.028, b[1] + 0.017, b[2] - 0.1 - (i % 3) * 0.075],
          [a[0] - 0.034, a[1] + 0.02, a[2] - 0.11 - (i % 2) * 0.08]],
        [0, 0, 1],
        i % 3 === 0 ? C.edgeMetal : i % 2 === 0 ? C.rust : C.edge
      );
    }
  });
  // Jagged exposed beams and broken cable trunks sticking out of the ceiling.
  for (let i = 0; i < 6; i += 1) {
    const xx = reversed * (-1.55 + i * 0.51);
    const yy = (i % 2 ? 1.02 : -1.09) + tilt;
    m.box(xx, yy, height - 0.08, 0.13 + (i % 3) * 0.075, 0.09, 0.2, C.edgeMetal);
    m.box(xx + 0.08, yy + (i % 2 ? 0.18 : -0.18),
      height - 0.16, 0.055, 0.42, 0.055, i % 2 ? C.cable : C.rust);
  }
  // Aged scorch patches and dark ruptures rather than uniform clean floors.
  for (let i = 0; i < 5; i += 1) {
    const xx = -1.16 + (i * 0.61 + variantIndex * 0.1) % 2.4;
    const yy = -0.8 + (i * 0.47) % 1.65;
    m.face(
      [[xx - 0.32, yy - 0.19, -0.055],
        [xx + 0.24, yy - 0.12, -0.055],
        [xx + 0.28, yy + 0.15, -0.055],
        [xx - 0.14, yy + 0.29, -0.055]],
      [0, 0, 1],
      i % 2 ? C.burn : C.soot
    );
  }
}

function buildMesh(variant: SalvageSectionVariant): readonly Face[] {
  const m = new ContainerMesh();
  switch (variant) {
    case 'corridor-complex': buildCorridorComplex(m); break;
    case 'double-deck': buildDoubleDeck(m); break;
    case 'engine-room': buildEngineRoom(m); break;
    case 'cargo-bay': buildCargoHold(m); break;
    case 'crew-quarters': buildCrewBlock(m); break;
    case 'bridge': buildBridge(m); break;
    case 'reactor-hall': buildReactorHall(m); break;
    case 'medbay': buildMedbay(m); break;
  }
  tornRoof(m, [
    'corridor-complex', 'double-deck', 'engine-room', 'cargo-bay',
    'crew-quarters', 'bridge', 'reactor-hall', 'medbay',
  ].indexOf(variant));
  return m.faces;
}

export const SALVAGE_SECTION_VARIANTS = [
  'corridor-complex', 'double-deck', 'engine-room', 'cargo-bay',
  'crew-quarters', 'bridge', 'reactor-hall', 'medbay',
] as const satisfies readonly SalvageSectionVariant[];

const meshes: Record<SalvageSectionVariant, readonly Face[]> = {
  'corridor-complex': buildMesh('corridor-complex'),
  'double-deck': buildMesh('double-deck'),
  'engine-room': buildMesh('engine-room'),
  'cargo-bay': buildMesh('cargo-bay'),
  'crew-quarters': buildMesh('crew-quarters'),
  bridge: buildMesh('bridge'),
  'reactor-hall': buildMesh('reactor-hall'),
  medbay: buildMesh('medbay'),
};

export function drawSalvageSection3d(
  context: CanvasRenderingContext2D,
  section: Pick<SalvageSection, 'variant' | 'rotation3d' | 'effectSeed'>,
  radius: number,
  timeSeconds: number
): void {
  const mesh = meshes[section.variant];
  if (
    radius >= 40 ||
    !drawCachedSalvageMesh(
      context,
      'section:' + section.variant,
      mesh,
      radius,
      section.rotation3d,
      256
    )
  ) {
    drawProjectedSalvageMesh(context, mesh, radius, section.rotation3d);
  }
  if (radius < 16) return;
  const phase = (timeSeconds * 0.71 + section.effectSeed * 0.000023) % 4.9;
  const x = -radius * 0.19;
  const y = radius * 0.08;
  if (phase < 0.32) {
    context.save();
    context.strokeStyle = 'rgba(156,228,255,0.90)';
    context.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) {
      const angle = phase * 21 + i * 2.4;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * (4 + i * 2), y + Math.sin(angle) * (4 + i));
      context.stroke();
    }
    context.restore();
  }
  // Short, sparse escaping atmosphere and coolant; rotation follows the wreck.
  context.save();
  context.translate(radius * 0.24, -radius * 0.2);
  context.rotate(section.rotation3d.z + 0.28);
  for (let i = 0; i < 6; i += 1) {
    const p = (timeSeconds * 0.27 + i / 6 + section.effectSeed * 0.0001) % 1;
    const spread = radius * 0.72 * p;
    context.fillStyle = `rgba(173,201,209,${0.11 * (1 - p)})`;
    context.beginPath();
    context.arc(spread, Math.sin(i * 2.15) * radius * 0.05, radius * (0.035 + p * 0.09), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
