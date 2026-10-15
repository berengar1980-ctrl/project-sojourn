import type { SalvageDebris, SalvageDebrisVariant } from '../../core/salvage-types';
import { drawCachedSalvageMesh } from './salvage-mesh-lod-cache';
import {
  C,
  plate,
  beam,
  cable,
  hatch,
  grates,
  tornFrame,
  buildCorridor,
  buildDeck,
  buildAirlock,
} from './salvage-debris-structures';
import { ContainerMesh, drawProjectedSalvageMesh, type Face } from './salvage-container-mesh';

function buildTruss(m: ContainerMesh): void {
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

function buildEngine(m: ContainerMesh): void {
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

function buildReactor(m: ContainerMesh): void {
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

function buildBulkhead(m: ContainerMesh): void {
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

function buildHabitation(m: ContainerMesh): void {
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

function makeMesh(variant: SalvageDebrisVariant): readonly Face[] {
  const mesh = new ContainerMesh();
  switch (variant) {
    case 'corridor':
      buildCorridor(mesh);
      break;
    case 'deck':
      buildDeck(mesh);
      break;
    case 'airlock':
      buildAirlock(mesh);
      break;
    case 'truss':
      buildTruss(mesh);
      break;
    case 'engine':
      buildEngine(mesh);
      break;
    case 'reactor':
      buildReactor(mesh);
      break;
    case 'bulkhead':
      buildBulkhead(mesh);
      break;
    case 'habitation':
      buildHabitation(mesh);
      break;
  }
  return mesh.faces;
}

const cached: Readonly<Record<SalvageDebrisVariant, readonly Face[]>> = {
  corridor: makeMesh('corridor'),
  deck: makeMesh('deck'),
  airlock: makeMesh('airlock'),
  truss: makeMesh('truss'),
  engine: makeMesh('engine'),
  reactor: makeMesh('reactor'),
  bulkhead: makeMesh('bulkhead'),
  habitation: makeMesh('habitation'),
};

function effects(
  context: CanvasRenderingContext2D,
  part: Pick<SalvageDebris, 'variant' | 'rotation3d' | 'effectSeed'>,
  radius: number,
  timeSeconds: number
): void {
  const seed = part.effectSeed;
  // Deterministic short-circuit bursts; no particle allocations or persistent emitters.
  const phase = (timeSeconds * 0.68 + seed * 0.000041) % 3.7;
  const sparkPulse = phase > 2.92 && phase < 3.22;
  const angle = part.rotation3d.z;
  const x = Math.cos(angle) * radius * 0.19;
  const y = -Math.sin(angle) * radius * 0.19;
  if (sparkPulse) {
    context.save();
    context.translate(x, y);
    context.strokeStyle = 'rgba(121, 211, 255, 0.96)';
    context.lineWidth = 1.1;
    for (let i = 0; i < 5; i += 1) {
      const a = (i * 2.399 + seed * 0.019 + timeSeconds * 0.31) % (Math.PI * 2);
      const len = Math.min(8, 2 + radius * 0.15 + (i % 3));
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      context.stroke();
    }
    context.fillStyle = '#f7f1da';
    context.fillRect(-1.1, -1.1, 2.2, 2.2);
    context.restore();
  }

  // Only five of eight variants vent gas. The smoke is six translucent 2D
  // puffs attached to a rupture, not a full physics-based particle simulation.
  if (part.variant === 'deck' || part.variant === 'truss' || part.variant === 'bulkhead') return;
  const breathe = 0.57 + 0.19 * Math.sin(timeSeconds * 0.92 + seed * 0.01);
  context.save();
  context.translate(-x, -y);
  context.rotate(angle + 0.43);
  for (let i = 0; i < 6; i += 1) {
    const shift = (timeSeconds * 0.36 + i / 6 + seed * 0.00003) % 1;
    const spread = radius * (0.16 + shift * 0.7);
    const puffRadius = Math.max(1, radius * (0.035 + 0.12 * shift));
    context.fillStyle = `rgba(174, 198, 208, ${(1 - shift) * breathe * 0.13})`;
    context.beginPath();
    context.arc(spread, Math.sin(i * 2.1 + seed) * puffRadius * 0.55, puffRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function drawSalvageDebris3d(
  context: CanvasRenderingContext2D,
  part: Pick<SalvageDebris, 'variant' | 'rotation3d' | 'effectSeed'>,
  radius: number,
  timeSeconds: number
): void {
  const mesh = cached[part.variant];
  if (
    radius >= 27 ||
    !drawCachedSalvageMesh(context, 'debris:' + part.variant, mesh, radius, part.rotation3d, 192)
  ) {
    drawProjectedSalvageMesh(context, mesh, radius, part.rotation3d);
  }
  if (radius >= 16) effects(context, part, radius, timeSeconds);
}
