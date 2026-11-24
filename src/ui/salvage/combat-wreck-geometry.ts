import type { Color, ContainerMesh, Vec3 } from './salvage-container-mesh';

/** Shared immutable mesh construction helpers for damaged hulls. */
export const C = {
  hull: [47, 57, 62],
  plate: [91, 99, 104],
  steel: [122, 132, 135],
  dark: [22, 29, 33],
  char: [10, 13, 16],
  iron: [66, 75, 79],
} as const satisfies Record<string, Color>;

type Hull = readonly (readonly [number, number])[];

/** Ragged extruded plates: broken perimeter, rather than rectangular boxes. */
export function shell(m: ContainerMesh, outline: Hull, z0: number, z1: number, color: Color): void {
  const upper: Vec3[] = outline.map(([x, y]) => [x, y, z1]);
  const lower: Vec3[] = [...outline].reverse().map(([x, y]) => [x, y, z0]);
  m.face(upper, [0, 0, 1], color);
  m.face(lower, [0, 0, -1], C.dark);
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const nx = b[1] - a[1];
    const ny = a[0] - b[0];
    const len = Math.hypot(nx, ny) || 1;
    m.face(
      [
        [a[0], a[1], z0],
        [b[0], b[1], z0],
        [b[0], b[1], z1],
        [a[0], a[1], z1],
      ],
      [nx / len, ny / len, 0],
      i % 3 === 0 ? C.iron : color
    );
  }
}

export function strut(
  m: ContainerMesh,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  z: number,
  width = 0.07,
  color: Color = C.steel
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const px = (-dy / length) * width;
  const py = (dx / length) * width;
  shell(
    m,
    [
      [ax + px, ay + py],
      [bx + px, by + py],
      [bx - px, by - py],
      [ax - px, ay - py],
    ],
    z - 0.045,
    z + 0.045,
    color
  );
}

export function ribs(
  m: ContainerMesh,
  from: number,
  to: number,
  width: number,
  count: number
): void {
  for (let i = 0; i < count; i += 1) {
    const x = from + ((to - from) * i) / Math.max(1, count - 1);
    strut(m, x, -width / 2, x + (i % 3) * 0.08, width / 2, 0.36, 0.065, i % 3 ? C.iron : C.steel);
    m.box(x, 0, -0.23, 0.08, width * 0.85, 0.12, C.dark);
  }
}

export function soot(m: ContainerMesh, x: number, y: number, size: number): void {
  shell(
    m,
    [
      [x - size * 0.55, y - size * 0.23],
      [x - size * 0.19, y - size * 0.5],
      [x + size * 0.32, y - size * 0.31],
      [x + size * 0.54, y + size * 0.16],
      [x + size * 0.1, y + size * 0.43],
      [x - size * 0.39, y + size * 0.3],
    ],
    0.56,
    0.575,
    C.char
  );
}

export function fragment(
  m: ContainerMesh,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: Color
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const base: Hull = [
    [-0.62, -0.3],
    [0.3, -0.43],
    [0.64, -0.05],
    [0.34, 0.47],
    [-0.24, 0.31],
    [-0.52, 0.09],
  ];
  shell(
    m,
    base.map(([px, py]) => [x + (px * c - py * s) * size, y + (px * s + py * c) * size] as const),
    -0.13,
    0.29,
    color
  );
  strut(m, x - size * 0.3, y - size * 0.08, x + size * 0.33, y + size * 0.09, 0.32, 0.035);
}

export function scatter(m: ContainerMesh, count: number, spread: number, seed: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.399963 + seed;
    const radius = spread * (0.56 + ((i * 17) % 11) / 21);
    fragment(
      m,
      Math.cos(a) * radius,
      Math.sin(a) * radius,
      0.12 + ((i * 7) % 5) * 0.045,
      a * 1.7,
      i % 5 === 0 ? C.steel : i % 3 === 0 ? C.char : C.iron
    );
  }
}
