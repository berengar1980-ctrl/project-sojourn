import { type ContainerMesh } from './salvage-container-mesh';
import { beam, C, cable, grates, hatch, plate, tornFrame } from './salvage-debris-geometry';
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

export function buildTruss(m: ContainerMesh): void {
  tornFrame(m, 4.64, 0.75, 0.11);
  for (let i = 0; i < 6; i += 1) {
    const x = -2.12 + i * 0.76;
    beam(m, x, -0.33, x + 0.66, 0.34, 0.39, 0.09, C.light);
    beam(m, x + 0.17, 0.34, x + 0.75, -0.34, -0.03, 0.09, C.rib);
  }
  for (const x of [-1.62, 0.83]) {
    grates(m, x, 0, 0.6, 0.63);
  }
  plate(
    m,
    [
      [-2.33, -0.49],
      [-1.65, -0.67],
      [-1.29, -0.38],
      [-1.5, 0.03],
      [-2.23, 0.18],
    ],
    0.46,
    0.14,
    C.plating
  );
  plate(
    m,
    [
      [1.18, 0.14],
      [1.87, 0.19],
      [2.18, 0.47],
      [1.37, 0.61],
    ],
    0.41,
    0.14,
    C.rust
  );
  cable(
    m,
    [
      [-2.34, 0.16],
      [-1.68, 0.06],
      [-0.9, 0.14],
      [-0.19, 0.01],
      [0.78, 0.2],
      [1.55, 0.12],
      [2.45, 0.32],
    ],
    0.58,
    C.cable
  );
  cable(
    m,
    [
      [-2.2, -0.03],
      [-1.3, -0.1],
      [-0.16, -0.22],
      [0.72, -0.03],
      [1.74, -0.22],
    ],
    0.48,
    C.coolant
  );
}
