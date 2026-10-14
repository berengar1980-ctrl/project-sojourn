import type { SalvageContainerVariant } from '../../core/salvage-types';

/** Lightweight orthographic 3D projected into the existing 2D salvage canvas.
 * Geometry is shared by every instance; no WebGL context, textures or per-frame mesh allocations.
 */
export type Vec3 = readonly [number, number, number];
export type Color = readonly [number, number, number];
export interface Face {
  readonly points: readonly Vec3[];
  readonly normal: Vec3;
  readonly color: Color;
}
const colors = {
  hull: [82, 104, 112],
  roof: [113, 132, 136],
  steel: [146, 158, 159],
  seam: [35, 49, 55],
  edge: [54, 64, 69],
  dark: [26, 35, 41],
  rust: [131, 84, 57],
  amber: [203, 150, 68],
  pale: [202, 192, 147],
  teal: [72, 166, 160],
  tank: [118, 128, 126],
  red: [154, 62, 51],
} as const satisfies Record<string, Color>;

export class ContainerMesh {
  readonly faces: Face[] = [];

  face(points: readonly Vec3[], normal: Vec3, color: Color): void {
    this.faces.push({ points, normal, color });
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: Color): void {
    const x0 = x - w / 2,
      x1 = x + w / 2;
    const y0 = y - h / 2,
      y1 = y + h / 2;
    const z0 = z - d / 2,
      z1 = z + d / 2;
    this.face(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [0, 0, 1],
      color
    );
    this.face(
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
      [0, 0, -1],
      color
    );
    this.face(
      [
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
      [0, 1, 0],
      color
    );
    this.face(
      [
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
        [x0, y0, z0],
      ],
      [0, -1, 0],
      color
    );
    this.face(
      [
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
        [x1, y0, z0],
      ],
      [1, 0, 0],
      color
    );
    this.face(
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      [-1, 0, 0],
      color
    );
  }

  cylinder(cx: number, cy: number, cz: number, length: number, radius: number, color: Color): void {
    const segments = 12;
    const x0 = cx - length / 2,
      x1 = cx + length / 2;
    for (let i = 0; i < segments; i += 1) {
      const a = (i * Math.PI * 2) / segments;
      const b = ((i + 1) * Math.PI * 2) / segments;
      const ca = Math.cos(a),
        sa = Math.sin(a),
        cb = Math.cos(b),
        sb = Math.sin(b);
      this.face(
        [
          [x0, cy + radius * ca, cz + radius * sa],
          [x1, cy + radius * ca, cz + radius * sa],
          [x1, cy + radius * cb, cz + radius * sb],
          [x0, cy + radius * cb, cz + radius * sb],
        ],
        [0, Math.cos((a + b) / 2), Math.sin((a + b) / 2)],
        color
      );
      this.face(
        [
          [x0, cy, cz],
          [x0, cy + radius * cb, cz + radius * sb],
          [x0, cy + radius * ca, cz + radius * sa],
        ],
        [-1, 0, 0],
        colors.edge
      );
      this.face(
        [
          [x1, cy, cz],
          [x1, cy + radius * ca, cz + radius * sa],
          [x1, cy + radius * cb, cz + radius * sb],
        ],
        [1, 0, 0],
        colors.steel
      );
    }
  }
}

type BoxDrawer = (...args: Parameters<ContainerMesh['box']>) => void;

function createTankGeometry(m: ContainerMesh, box: BoxDrawer): void {
    box(0, 0, -0.23, 3.34, 1.62, 0.23, colors.dark);
    for (const y of [-0.79, 0.79]) box(0, y, -0.13, 3.43, 0.12, 0.36, colors.edge);
    for (const y of [-0.39, 0.39]) {
      m.cylinder(0, y, 0.15, 2.92, 0.4, colors.tank);
      for (const x of [-1.12, -0.52, 0.1, 0.77, 1.16])
        m.cylinder(x, y, 0.15, 0.07, 0.435, colors.steel);
      box(-1.52, y, 0.15, 0.11, 0.37, 0.35, colors.dark);
      box(1.52, y, 0.15, 0.11, 0.37, 0.35, colors.dark);
      box(0.4, y, 0.59, 0.43, 0.07, 0.065, colors.amber);
    }
    for (const x of [-1.5, 1.5])
      for (const y of [-0.7, 0.7]) box(x, y, 0, 0.18, 0.19, 0.47, colors.steel);
    box(-0.15, 0, 0.59, 0.72, 0.17, 0.11, colors.dark);
    box(-0.15, 0, 0.66, 0.51, 0.075, 0.065, colors.teal);
  }

function createStandardGeometry(box: BoxDrawer, variant: SalvageContainerVariant): void {
    box(0, 0, 0, 3.24, 1.46, 0.88, colors.hull);
    box(0, 0, 0.47, 3.04, 1.29, 0.08, colors.roof);
    box(0, 0, 0.52, 2.74, 1.09, 0.065, variant === 'damaged' ? colors.hull : colors.steel);
    for (const y of [-0.74, 0.74]) box(0, y, 0, 3.38, 0.105, 1.0, colors.edge);
    for (const x of [-1.64, 1.64]) box(x, 0, 0, 0.12, 1.6, 1.04, colors.edge);
    for (const x of [-1.6, 1.6])
      for (const y of [-0.7, 0.7]) box(x, y, 0.1, 0.16, 0.16, 1.17, colors.steel);
    for (let i = 0; i < 11; i += 1) {
      const x = -1.3 + i * 0.26;
      box(x, 0, 0.57, 0.035, 1.04, 0.05, i % 4 === 0 ? colors.steel : colors.seam);
      for (const y of [-0.77, 0.77])
        box(x, y, 0.01, 0.055, 0.05, 0.72, i % 4 === 0 ? colors.rust : colors.roof);
    }
    for (const y of [-0.55, 0.55]) box(0, y, 0.575, 2.89, 0.058, 0.065, colors.steel);
    box(-0.33, 0, 0.61, 0.75, 0.6, 0.08, colors.dark);
    box(-0.33, 0, 0.66, 0.65, 0.53, 0.05, colors.roof);
    box(-0.33, 0, 0.69, 0.51, 0.055, 0.035, colors.seam);
    box(-0.33, 0, 0.69, 0.05, 0.43, 0.035, colors.seam);
    for (const x of [-1.36, 1.36]) {
      box(x, 0, 0.61, 0.065, 1.19, 0.1, colors.steel);
      for (const y of [-0.48, 0.48]) box(x, y, 0.66, 0.17, 0.11, 0.047, colors.amber);
    }
    for (let i = 0; i < 4; i += 1)
      box(0.76 + i * 0.16, -0.49, 0.62, 0.11, 0.15, 0.045, i % 2 ? colors.pale : colors.amber);
    box(1.56, -0.37, 0.07, 0.06, 0.23, 0.16, colors.teal);
    box(-1.56, 0.37, 0.07, 0.06, 0.23, 0.16, colors.red);
    for (const y of [-0.44, 0, 0.44]) box(1.71, y, 0, 0.034, 0.035, 0.6, colors.steel);
    if (variant === 'damaged') {
      box(0.45, 0.15, 0.61, 1.13, 0.82, 0.13, colors.dark);
      box(0.45, 0.15, 0.68, 0.91, 0.6, 0.07, colors.seam);
      for (const x of [-0.15, 0.12, 0.58, 0.86])
        box(x, 0.12, 0.74, 0.065, 0.62, 0.085, colors.rust);
      box(-1.22, 0.33, 0.68, 0.39, 0.25, 0.09, colors.rust);
      box(1.52, -0.62, 0.12, 0.45, 0.13, 0.35, colors.rust);
      box(0.92, -0.47, 0.67, 0.24, 0.17, 0.05, colors.red);
    }
  }

function createContainer(variant: SalvageContainerVariant): readonly Face[] {
  const m = new ContainerMesh();
  const box = (...args: Parameters<ContainerMesh['box']>): void => m.box(...args);
  if (variant === 'tank') createTankGeometry(m, box);
  else createStandardGeometry(box, variant);
  return m.faces;
}

const meshes: Readonly<Record<SalvageContainerVariant, readonly Face[]>> = {
  standard: createContainer('standard'),
  damaged: createContainer('damaged'),
  tank: createContainer('tank'),
};

function rotate(
  point: Vec3,
  cx: number,
  sx: number,
  cy: number,
  sy: number,
  cz: number,
  sz: number
): Vec3 {
  const y1 = point[1] * cx - point[2] * sx;
  const z1 = point[1] * sx + point[2] * cx;
  const x2 = point[0] * cy + z1 * sy;
  const z2 = -point[0] * sy + z1 * cy;
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
}

/** Called only for onscreen containers; caller has translated to the object center. */
export function drawSalvageContainer3d(
  context: CanvasRenderingContext2D,
  variant: SalvageContainerVariant,
  radius: number,
  rotation: Readonly<{ x: number; y: number; z: number }>
): void {
  drawProjectedSalvageMesh(context, meshes[variant], radius, rotation);
}

/** One painter for all 11 cached meshes. No extra canvas or WebGL layer. */
export function drawProjectedSalvageMesh(
  context: CanvasRenderingContext2D,
  mesh: readonly Face[],
  radius: number,
  rotation: Readonly<{ x: number; y: number; z: number }>
): void {
  const cx = Math.cos(rotation.x),
    sx = Math.sin(rotation.x);
  const cy = Math.cos(rotation.y),
    sy = Math.sin(rotation.y);
  const cz = Math.cos(rotation.z),
    sz = Math.sin(rotation.z);
  const scale = radius / 1.9;
  const faces: { readonly z: number; readonly points: readonly Vec3[]; readonly color: string }[] =
    [];
  for (const face of mesh) {
    const normal = rotate(face.normal, cx, sx, cy, sy, cz, sz);
    if (normal[2] <= 0.005) continue;
    const light = Math.max(0, -normal[0] * 0.34 + normal[1] * 0.51 + normal[2] * 0.79);
    const intensity = 0.31 + 0.79 * light;
    const points = face.points.map((point) => rotate(point, cx, sx, cy, sy, cz, sz));
    const z = points.reduce((sum, point) => sum + point[2], 0) / points.length;
    const color = `rgb(${face.color.map((channel) => Math.min(255, Math.round(channel * intensity))).join(',')})`;
    faces.push({ z, points, color });
  }
  faces.sort((a, b) => a.z - b.z);
  for (const face of faces) {
    context.fillStyle = face.color;
    context.beginPath();
    face.points.forEach((point, index) => {
      const x = point[0] * scale;
      const y = -point[1] * scale;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fill();
  }
}
