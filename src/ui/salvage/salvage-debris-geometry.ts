import { type ContainerMesh, type Color, type Vec3 } from './salvage-container-mesh';
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
