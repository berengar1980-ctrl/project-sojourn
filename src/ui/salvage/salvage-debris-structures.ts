import type { ContainerMesh, Color, Vec3 } from './salvage-container-mesh';

// Eight distinct reusable 3D meshes: beams, torn plating, open floors, pipes,
// doors and loose power conduits. Built once; instances only carry pose.
export const C = {
  hull: [54, 64, 70],
  plating: [86, 96, 96],
  light: [109, 115, 109],
  rib: [31, 39, 44],
  dark: [17, 23, 28],
  rust: [90, 57, 44],
  brass: [121, 88, 50],
  caution: [151, 112, 45],
  cable: [104, 37, 32],
  coolant: [41, 78, 105],
  glass: [38, 65, 75],
} as const satisfies Record<string, Color>;

type Point = readonly [number, number];

/** Low-poly thick irregular plate with ripped edges. */
export function plate(
  m: ContainerMesh,
  path: readonly Point[],
  z: number,
  depth: number,
  color: Color
): void {
  const top: Vec3[] = path.map(([x, y]) => [x, y, z]);
  const bottom: Vec3[] = path.map(([x, y]) => [x, y, z - depth]);
  m.face(top, [0, 0, 1], color);
  m.face([...bottom].reverse(), [0, 0, -1], C.rib);
  for (let i = 0; i < path.length; i += 1) {
    const next = (i + 1) % path.length;
    const a = path[i]!;
    const b = path[next]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    m.face(
      [bottom[i]!, bottom[next]!, top[next]!, top[i]!],
      [dy / length, -dx / length, 0],
      i % 3 === 0 ? C.rust : C.hull
    );
  }
}

/** A structural I-beam or length of exposed cable, including actual thickness. */
export function beam(
  m: ContainerMesh,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  z: number,
  width: number,
  color: Color
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = ((-dy / length) * width) / 2;
  const ny = ((dx / length) * width) / 2;
  plate(
    m,
    [
      [ax - nx, ay - ny],
      [bx - nx, by - ny],
      [bx + nx, by + ny],
      [ax + nx, ay + ny],
    ],
    z,
    Math.max(0.035, width * 0.62),
    color
  );
}

export function cable(m: ContainerMesh, path: readonly Point[], z: number, color: Color): void {
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1]!;
    const next = path[i]!;
    beam(m, prev[0], prev[1], next[0], next[1], z, 0.065, color);
  }
}

/** Ribbed hatch with a readable dark opening and a half-hanging door. */
export function hatch(m: ContainerMesh, x: number, y: number, scale = 1): void {
  m.box(x, y, 0.36, 1.06 * scale, 0.98 * scale, 0.18, C.caution);
  m.box(x, y, 0.49, 0.83 * scale, 0.78 * scale, 0.06, C.dark);
  m.box(x - 0.19 * scale, y - 0.03 * scale, 0.57, 0.43 * scale, 0.66 * scale, 0.08, C.plating);
  m.box(x - 0.19 * scale, y - 0.03 * scale, 0.63, 0.085 * scale, 0.43 * scale, 0.045, C.glass);
  m.box(x + 0.23 * scale, y - 0.26 * scale, 0.61, 0.1 * scale, 0.12 * scale, 0.09, C.brass);
}

export function grates(m: ContainerMesh, x: number, y: number, w: number, h: number): void {
  m.box(x, y, 0.13, w, h, 0.045, C.dark);
  for (let i = 1; i < 7; i += 1) {
    const offset = -w / 2 + (w * i) / 7;
    beam(m, x + offset, y - h / 2, x + offset, y + h / 2, 0.16, 0.024, C.hull);
  }
}

export function tornFrame(m: ContainerMesh, w: number, h: number, z: number): void {
  for (const y of [-h / 2, h / 2]) {
    beam(m, -w / 2, y, w / 2, y, z, 0.13, C.rib);
  }
  for (const x of [-w / 2, w / 2]) {
    beam(m, x, -h / 2, x, h / 2, z, 0.13, C.rib);
  }
  for (let i = 0; i < 4; i += 1) {
    const x = -w / 2 + (w * (i + 0.45)) / 4;
    beam(m, x, -h / 2, x + 0.32, h / 2, z + 0.07, 0.075, C.light);
  }
}

export function buildCorridor(m: ContainerMesh): void {
  plate(
    m,
    [
      [-1.8, -0.94],
      [0.64, -0.95],
      [1.58, -0.6],
      [1.64, 0.73],
      [0.5, 0.96],
      [-0.14, 0.73],
      [-1.68, 0.91],
    ],
    -0.17,
    0.17,
    C.plating
  );
  for (const x of [-1.16, -0.46, 0.26, 1.0]) {
    grates(m, x, 0.01, 0.45, 1.36);
  }
  for (const y of [-0.8, 0.8]) beam(m, -1.75, y, 1.55, y, 0.34, 0.14, C.rib);
  for (const x of [-1.45, -0.3, 1.12]) {
    m.box(x, -0.77, 0.24, 0.18, 0.14, 0.87, C.hull);
    m.box(x, 0.77, 0.24, 0.18, 0.14, 0.87, C.hull);
  }
  hatch(m, 0.93, 0.1, 0.77);
  cable(
    m,
    [
      [-1.71, 0.84],
      [-1.1, 0.6],
      [-0.7, 0.71],
      [-0.13, 0.46],
      [0.4, 0.55],
    ],
    0.57,
    C.cable
  );
  cable(
    m,
    [
      [-1.75, 0.67],
      [-1.22, 0.43],
      [-0.65, 0.59],
      [0.1, 0.31],
    ],
    0.61,
    C.coolant
  );
  plate(
    m,
    [
      [-1.8, -0.93],
      [-1.05, -1.12],
      [-0.78, -0.76],
      [-1.16, -0.59],
    ],
    0.45,
    0.14,
    C.rust
  );
}

export function buildDeck(m: ContainerMesh): void {
  plate(
    m,
    [
      [-1.94, -0.92],
      [-1.11, -1.13],
      [-0.6, -0.83],
      [0.6, -1.06],
      [1.81, -0.66],
      [1.56, 0.68],
      [0.93, 0.87],
      [0.28, 0.53],
      [-0.47, 1.07],
      [-1.74, 0.65],
    ],
    -0.24,
    0.17,
    C.hull
  );
  for (let i = -2; i <= 2; i += 1) grates(m, i * 0.56, -0.08, 0.47, 1.31);
  beam(m, -1.87, -0.71, 1.65, -0.69, 0.18, 0.12, C.caution);
  beam(m, -1.87, 0.72, 0.26, 0.72, 0.17, 0.12, C.caution);
  for (const x of [-1.51, -0.64, 0.25, 1.1]) {
    m.box(x, -0.74, 0.41, 0.09, 0.1, 0.7, C.brass);
    m.box(x, 0.67, 0.35, 0.09, 0.1, 0.58, C.brass);
  }
  beam(m, -1.51, -0.74, 1.1, -0.74, 0.82, 0.075, C.light);
  plate(
    m,
    [
      [1.0, -0.72],
      [1.93, -0.47],
      [1.42, 0.22],
      [1.17, 0.14],
    ],
    0.38,
    0.18,
    C.plating
  );
  cable(
    m,
    [
      [-1.52, 0.59],
      [-0.8, 0.79],
      [-0.17, 0.92],
      [0.43, 0.71],
    ],
    0.23,
    C.cable
  );
}

export function buildAirlock(m: ContainerMesh): void {
  const segments = 9;
  for (let i = 0; i < segments; i += 1) {
    if (i === 1 || i === 5) continue; // blasted-away structural ring sections
    const a = (Math.PI * 2 * i) / segments;
    const b = (Math.PI * 2 * (i + 1)) / segments;
    const x0 = Math.cos(a) * 1.26,
      y0 = Math.sin(a) * 1.08;
    const x1 = Math.cos(b) * 1.26,
      y1 = Math.sin(b) * 1.08;
    beam(m, x0, y0, x1, y1, 0.24, 0.28, C.hull);
    beam(m, x0 * 0.79, y0 * 0.79, x1 * 0.79, y1 * 0.79, 0.57, 0.14, C.light);
    beam(m, x0, y0, x0 * 0.79, y0 * 0.79, 0.6, 0.1, C.caution);
  }
  plate(
    m,
    [
      [-1.86, -0.69],
      [-1.07, -0.83],
      [-0.74, -0.52],
      [-1.01, 0.16],
      [-1.65, 0.09],
    ],
    -0.15,
    0.18,
    C.plating
  );
  plate(
    m,
    [
      [0.8, 0.69],
      [1.8, 0.67],
      [1.62, 1.11],
      [0.87, 1.24],
    ],
    0.36,
    0.13,
    C.rust
  );
  m.box(0.59, 0.01, -0.06, 0.26, 0.99, 0.2, C.plating);
  for (const y of [-0.64, -0.42, 0.45, 0.65]) {
    beam(m, -1.35, y, -0.7, y, 0.53, 0.08, C.rib);
  }
  cable(
    m,
    [
      [1.15, 0.46],
      [1.57, 0.52],
      [1.91, 0.44],
      [2.08, 0.27],
    ],
    0.35,
    C.cable
  );
  cable(
    m,
    [
      [1.17, 0.39],
      [1.68, 0.23],
      [2.04, 0.06],
    ],
    0.39,
    C.coolant
  );
}

