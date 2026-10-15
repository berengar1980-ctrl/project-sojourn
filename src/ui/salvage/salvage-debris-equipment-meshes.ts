import { type ContainerMesh } from './salvage-container-mesh';
import { beam, C, cable, grates, hatch, plate, tornFrame } from './salvage-debris-geometry';
export function buildEngine(m: ContainerMesh): void {
  m.cylinder(0, 0, 0.15, 2.6, 0.64, C.hull);
  for (const x of [-1.06, -0.68, 0.26, 0.82, 1.16]) {
    m.cylinder(x, 0, 0.15, 0.11, 0.7, x > 0.7 ? C.rust : C.light);
  }
  m.cylinder(1.43, 0, 0.15, 0.23, 0.76, C.dark);
  for (let i = 0; i < 9; i += 1) {
    const angle = (i * Math.PI * 2) / 9;
    m.box(
      1.56,
      Math.cos(angle) * 0.51,
      0.15 + Math.sin(angle) * 0.51,
      0.31,
      0.14,
      0.16,
      i % 2 ? C.hull : C.rust
    );
  }
  for (const y of [-0.77, 0.77]) {
    beam(m, -1.75, y, 1.17, y, -0.12, 0.17, C.rib);
    beam(m, -1.37, y * 1.17, -0.28, y * 0.92, 0.34, 0.12, C.light);
  }
  plate(
    m,
    [
      [-1.79, -0.93],
      [-0.94, -0.81],
      [-0.52, -0.48],
      [-1.55, -0.36],
    ],
    0.56,
    0.16,
    C.plating
  );
  cable(
    m,
    [
      [-1.68, 0.63],
      [-1.06, 0.91],
      [-0.4, 0.75],
      [0.54, 0.95],
    ],
    0.48,
    C.cable
  );
  cable(
    m,
    [
      [-1.77, 0.53],
      [-0.78, 0.66],
      [-0.26, 0.82],
      [0.75, 0.67],
    ],
    0.55,
    C.coolant
  );
}

export function buildReactor(m: ContainerMesh): void {
  tornFrame(m, 3.52, 1.82, -0.2);
  for (const y of [-0.5, 0.5]) {
    m.cylinder(-0.16, y, 0.11, 2.61, 0.32, C.hull);
    for (const x of [-1.22, -0.53, 0.16, 0.92]) {
      m.cylinder(x, y, 0.11, 0.11, 0.36, x === 0.16 ? C.caution : C.light);
    }
  }
  m.box(0.1, 0, 0.43, 1.04, 0.43, 0.37, C.rust);
  m.box(0.1, 0, 0.64, 0.71, 0.26, 0.07, C.caution);
  plate(
    m,
    [
      [-1.85, -0.99],
      [-0.82, -1.06],
      [-0.6, -0.63],
      [-1.41, -0.31],
    ],
    0.48,
    0.13,
    C.plating
  );
  plate(
    m,
    [
      [0.66, 0.5],
      [1.62, 0.39],
      [1.91, 1.02],
      [1.14, 1.18],
    ],
    0.44,
    0.13,
    C.plating
  );
  for (const y of [-0.81, 0, 0.81]) {
    cable(
      m,
      [
        [-1.72, y],
        [-0.88, y + 0.12],
        [0.08, y + 0.05],
        [0.92, y + 0.17],
        [1.75, y + 0.24],
      ],
      0.79,
      y === 0 ? C.coolant : C.cable
    );
  }
}

export function buildBulkhead(m: ContainerMesh): void {
  plate(
    m,
    [
      [-1.87, -0.85],
      [1.47, -1.03],
      [1.96, -0.3],
      [1.68, 0.81],
      [0.95, 0.97],
      [0.69, 0.66],
      [-1.09, 0.81],
      [-1.87, 0.34],
    ],
    -0.13,
    0.23,
    C.plating
  );
  for (const x of [-1.47, -0.9, 0.91, 1.51]) {
    m.box(x, 0, 0.24, 0.13, 1.73, 0.72, C.rib);
  }
  hatch(m, -0.12, 0.03, 1.28);
  for (const y of [-0.82, 0.83]) beam(m, -1.8, y, 1.62, y, 0.53, 0.15, C.hull);
  plate(
    m,
    [
      [0.89, -0.85],
      [1.95, -0.95],
      [1.61, -0.13],
      [1.05, -0.41],
    ],
    0.54,
    0.09,
    C.rust
  );
  cable(
    m,
    [
      [1.34, 0.73],
      [1.64, 0.86],
      [2.12, 0.69],
      [2.33, 0.45],
    ],
    0.69,
    C.cable
  );
  cable(
    m,
    [
      [-1.66, -0.66],
      [-1.2, -0.84],
      [-0.59, -0.71],
    ],
    0.71,
    C.coolant
  );
}

export function buildHabitation(m: ContainerMesh): void {
  plate(
    m,
    [
      [-1.83, -1],
      [1.6, -0.92],
      [1.87, -0.12],
      [1.26, 0.99],
      [-0.23, 0.75],
      [-1.78, 0.95],
    ],
    -0.21,
    0.21,
    C.hull
  );
  for (const x of [-1.2, -0.38, 0.43, 1.21]) grates(m, x, 0, 0.55, 1.4);
  beam(m, -1.8, -0.88, 1.55, -0.88, 0.36, 0.19, C.rib);
  beam(m, -1.8, 0.85, -0.24, 0.85, 0.38, 0.19, C.rib);
  for (const x of [-1.5, 0.8, 1.44]) m.box(x, -0.83, 0.38, 0.12, 0.16, 0.88, C.plating);
  hatch(m, 0.82, -0.38, 0.76);
  m.box(-0.85, 0.59, 0.39, 0.73, 0.25, 0.51, C.dark);
  m.box(-0.85, 0.6, 0.69, 0.54, 0.12, 0.06, C.glass);
  m.box(-0.49, 0.54, 0.73, 0.075, 0.075, 0.04, C.caution);
  cable(
    m,
    [
      [-1.75, 0.8],
      [-1.35, 0.59],
      [-0.78, 0.72],
      [0, 0.54],
      [0.36, 0.91],
    ],
    0.62,
    C.cable
  );
  plate(
    m,
    [
      [1.17, 0.15],
      [1.92, 0.1],
      [1.66, 0.76],
      [1.16, 0.65],
    ],
    0.44,
    0.11,
    C.rust
  );
}
