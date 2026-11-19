import type { CombatWreckVariant } from '../../core/salvage-types';
import { drawCachedSalvageMesh } from './salvage-mesh-lod-cache';
import {
  ContainerMesh,
  drawProjectedSalvageMesh,
  type Color,
  type Face,
} from './salvage-container-mesh';

// Combat wrecks deliberately have no red paint or rusty-orange tint.
const C = {
  hull: [92, 100, 106],
  pale: [132, 137, 136],
  iron: [104, 113, 117],
  edge: [48, 56, 61],
  dark: [23, 27, 30],
  soot: [15, 17, 19],
  brown: [82, 72, 61],
  beige: [113, 105, 92],
} as const satisfies Record<string, Color>;

function plate(
  m: ContainerMesh,
  x: number,
  y: number,
  z: number,
  width: number,
  length: number,
  color: Color
): void {
  m.face(
    [
      [x - width * 0.53, y - length * 0.46, z],
      [x + width * 0.39, y - length * 0.58, z + 0.02],
      [x + width * 0.52, y - length * 0.22, z - 0.07],
      [x + width * 0.26, y + length * 0.12, z],
      [x + width * 0.51, y + length * 0.48, z - 0.04],
      [x - width * 0.36, y + length * 0.38, z],
      [x - width * 0.55, y + length * 0.07, z - 0.05],
    ],
    [0, 0, 1],
    color
  );
}

function scorch(m: ContainerMesh, x: number, y: number, z: number, size = 0.6): void {
  plate(m, x, y, z, size, size * 0.72, C.soot);
  plate(m, x + size * 0.12, y - size * 0.14, z + 0.008, size * 0.56, size * 0.41, C.dark);
}

function tornRibs(m: ContainerMesh, x: number, width: number): void {
  for (let i = 0; i < 6; i += 1) {
    const y = (i - 2.5) * width / 5;
    m.box(x + (i % 3) * 0.14, y, -0.08 + (i % 2) * 0.13, 0.13, 0.1, 0.81, i % 3 ? C.iron : C.edge);
    m.box(x + 0.42 + (i % 2) * 0.1, y, 0.02, 0.67, 0.065, 0.07, C.dark);
  }
}

function wreckField(m: ContainerMesh, variant: CombatWreckVariant): void {
  const count = variant === 'freighter' ? 49 : variant === 'patrol' ? 43 : 38;
  for (let i = 0; i < count; i += 1) {
    const angle = i * 2.3999632 + (variant === 'patrol' ? 1.1 : 0);
    const radius = 1.7 + ((i * 19) % 23) / 13;
    const x = Math.cos(angle) * radius + (i % 3) * 0.1;
    const y = Math.sin(angle) * radius * (variant === 'freighter' ? 0.91 : 1.12);
    const z = -0.55 + (i % 7) * 0.22;
    const w = 0.11 + ((i * 7) % 9) * 0.054;
    const h = 0.12 + ((i * 11) % 8) * 0.046;
    const colors = [C.iron, C.edge, C.dark, C.brown, C.beige, C.hull] as const;
    if (i % 3 === 0) {
      plate(m, x, y, z, w * 2.4, h * 1.5, colors[i % colors.length]!);
    } else {
      m.box(x, y, z, w, h, 0.07 + (i % 4) * 0.04, colors[i % colors.length]!);
    }
    if (i % 4 === 0) m.box(x + 0.2, y + 0.09, z - 0.08, 0.44, 0.06, 0.08, C.dark);
  }
}

function underside(m: ContainerMesh, length: number, width: number): void {
  for (let i = 0; i < 13; i += 1) {
    const x = -length * 0.44 + (i / 12) * length * 0.85;
    m.box(x, 0, -0.56, 0.075, width * 0.87, 0.11, i % 3 === 0 ? C.iron : C.dark);
    m.box(x, (i % 2 ? 1 : -1) * width * 0.3, -0.78, 0.33, 0.13, 0.17, C.brown);
    m.box(x + 0.13, 0, -0.63, 0.12, 0.18, 0.33, C.edge);
  }
  for (const y of [-width * 0.39, width * 0.39]) {
    m.box(-length * 0.05, y, -0.65, length * 0.86, 0.095, 0.12, C.iron);
  }
  for (let i = 0; i < 7; i += 1) {
    const x = -length * 0.3 + i * length * 0.085;
    scorch(m, x, i % 2 ? width * 0.21 : -width * 0.24, -0.835, 0.35);
  }
}

function miner(m: ContainerMesh): void {
  m.box(-1.06, 0, 0, 3.24, 2.0, 0.85, C.hull);
  m.box(-1.67, 0, 0.52, 1.35, 1.4, 0.18, C.pale);
  m.box(-2.37, 0, 0.37, 0.72, 0.86, 0.38, C.dark);
  for (const y of [-1.12, 1.12]) {
    m.cylinder(-1.48, y, -0.2, 1.88, 0.23, C.iron);
    m.box(-1.05, y, 0.2, 1.65, 0.17, 0.19, C.dark);
  }
  tornRibs(m, 0.72, 1.87);
  plate(m, -0.62, -0.76, 0.49, 1.7, 0.9, C.soot);
  plate(m, -1.44, 0.65, 0.51, 1.1, 0.64, C.brown);
  // Entire ore pod detached from the primary hull.
  m.box(2.0, 1.34, 0.2, 1.56, 1.05, 0.74, C.edge);
  plate(m, 2.0, 1.34, 0.61, 1.58, 0.85, C.hull);
  m.box(2.58, 1.17, 0.61, 0.08, 0.82, 0.15, C.iron);
  scorch(m, 1.99, 1.39, 0.65, 0.69);
  underside(m, 3.2, 2.1);
  wreckField(m, 'miner');
}

function freighter(m: ContainerMesh): void {
  m.box(-1.59, 0, -0.06, 3.16, 1.82, 0.84, C.hull);
  m.box(-2.51, 0, 0.48, 1.08, 1.19, 0.14, C.pale);
  m.box(-3.13, 0, 0.19, 0.54, 0.85, 0.38, C.dark);
  for (const y of [-0.78, 0.78]) m.box(-1.5, y, 0.48, 2.35, 0.11, 0.12, C.edge);
  tornRibs(m, 0.34, 2.1);
  for (let i = 0; i < 4; i += 1) {
    m.box(0.54 + i * 0.51, -0.29 + (i % 2) * 0.5, -0.37, 0.4, 0.17, 0.13, C.iron);
  }
  // Cargo and engine sections violently separated, leaving an exposed fracture.
  for (const y of [-1.34, 0, 1.34]) {
    const x = 2.15 + (y === 0 ? 0.55 : 0);
    m.box(x, y, -0.03, 1.2, 0.77, 0.7, y === 0 ? C.brown : C.edge);
    plate(m, x, y, 0.37, 1.18, 0.79, C.hull);
    scorch(m, x + 0.14, y - 0.1, 0.4, 0.51);
    for (let k = -1; k <= 1; k += 1) m.box(x + k * 0.3, y, 0.3, 0.04, 0.72, 0.06, C.dark);
  }
  m.box(3.69, 0.81, -0.28, 0.92, 1.42, 0.66, C.dark);
  for (const y of [0.4, 1.23]) m.cylinder(4.14, y, -0.25, 0.72, 0.24, C.iron);
  underside(m, 3.0, 1.85);
  scorch(m, -0.63, -0.24, 0.42, 0.85);
  wreckField(m, 'freighter');
}

function patrol(m: ContainerMesh): void {
  // Central hull survives. There are no attached wings.
  m.box(-0.99, 0, -0.02, 2.88, 1.46, 0.84, C.dark);
  m.box(-1.58, 0, 0.51, 1.14, 1.06, 0.13, C.iron);
  m.box(-2.26, 0, 0.17, 0.75, 0.85, 0.38, C.hull);
  tornRibs(m, 0.46, 1.38);
  for (const side of [-1, 1]) {
    const y = side * 0.84;
    // Ripped wing root, braces and jagged shear plates.
    m.box(-0.62, y, -0.25, 0.68, 0.24, 0.23, C.edge);
    m.box(-0.29, y + side * 0.2, -0.07, 0.52, 0.085, 0.07, C.iron);
    plate(m, -0.34, y + side * 0.1, 0.08, 0.61, 0.37, C.soot);
    // Entire wing is detached and offset on its corresponding side.
    const wx = 1.11 + (side > 0 ? 0.55 : 0);
    const wy = side * 2.53;
    plate(m, wx, wy, 0.08, 2.65, 0.91, C.hull);
    m.box(wx - 0.14, wy, -0.05, 1.73, 0.19, 0.19, C.iron);
    m.box(wx + 0.37, wy + side * 0.35, 0, 0.74, 0.21, 0.15, C.edge);
    scorch(m, wx - 0.11, wy, 0.1, 0.7);
  }
  scorch(m, -0.92, 0.13, 0.57, 0.92);
  underside(m, 2.6, 1.55);
  wreckField(m, 'patrol');
}

const meshes: Record<CombatWreckVariant, readonly Face[]> = {
  miner: build('miner'),
  freighter: build('freighter'),
  patrol: build('patrol'),
};

function build(variant: CombatWreckVariant): readonly Face[] {
  const mesh = new ContainerMesh();
  if (variant === 'miner') miner(mesh);
  else if (variant === 'freighter') freighter(mesh);
  else patrol(mesh);
  return mesh.faces;
}

/** Render the same neutral, torn 3D hull in salvage and combat. */
export function drawCombatWreck3d(
  context: CanvasRenderingContext2D,
  variant: CombatWreckVariant,
  radius: number,
  rotation: { x: number; y: number; z: number }
): void {
  const mesh = meshes[variant];
  if (
    radius >= 40 ||
    !drawCachedSalvageMesh(context, 'combat-wreck:' + variant, mesh, radius, rotation, 256)
  ) {
    drawProjectedSalvageMesh(context, mesh, radius, rotation);
  }
}
