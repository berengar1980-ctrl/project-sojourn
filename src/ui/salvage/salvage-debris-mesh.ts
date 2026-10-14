import type { SalvageDebris, SalvageDebrisVariant } from '../../core/salvage-types';
import {
  ContainerMesh,
  drawProjectedSalvageMesh,
  type Color,
  type Vec3,
  type Face,
} from './salvage-container-mesh';

// Eight distinct reusable 3D meshes: beams, torn plating, open floors, pipes,
// doors and loose power conduits. Built once; instances only carry pose.
const C = {
  hull: [74, 87, 95],
  plating: [125, 137, 136],
  light: [157, 159, 151],
  rib: [43, 55, 62],
  dark: [20, 30, 37],
  rust: [119, 75, 55],
  brass: [159, 117, 64],
  caution: [189, 139, 52],
  cable: [130, 47, 37],
  coolant: [50, 99, 137],
  glass: [46, 84, 98],
} as const satisfies Record<string, Color>;

type Point = readonly [number, number];

/** Low-poly thick irregular plate with ripped edges. */
function plate(
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
function beam(
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
  const nx = (-dy / length) * width / 2;
  const ny = (dx / length) * width / 2;
  plate(
    m,
    [[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]],
    z,
    Math.max(0.035, width * 0.62),
    color
  );
}

function cable(
  m: ContainerMesh,
  path: readonly Point[],
  z: number,
  color: Color
): void {
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1]!;
    const next = path[i]!;
    beam(m, prev[0], prev[1], next[0], next[1], z, 0.065, color);
  }
}

/** Ribbed hatch with a readable dark opening and a half-hanging door. */
function hatch(m: ContainerMesh, x: number, y: number, scale = 1): void {
  m.box(x, y, 0.36, 1.06 * scale, 0.98 * scale, 0.18, C.caution);
  m.box(x, y, 0.49, 0.83 * scale, 0.78 * scale, 0.06, C.dark);
  m.box(x - 0.19 * scale, y - 0.03 * scale, 0.57, 0.43 * scale, 0.66 * scale, 0.08, C.plating);
  m.box(x - 0.19 * scale, y - 0.03 * scale, 0.63, 0.085 * scale, 0.43 * scale, 0.045, C.glass);
  m.box(x + 0.23 * scale, y - 0.26 * scale, 0.61, 0.10 * scale, 0.12 * scale, 0.09, C.brass);
}

function grates(m: ContainerMesh, x: number, y: number, w: number, h: number): void {
  m.box(x, y, 0.13, w, h, 0.045, C.dark);
  for (let i = 1; i < 7; i += 1) {
    const offset = -w / 2 + (w * i) / 7;
    beam(m, x + offset, y - h / 2, x + offset, y + h / 2, 0.16, 0.024, C.hull);
  }
}

function tornFrame(m: ContainerMesh, w: number, h: number, z: number): void {
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

function buildCorridor(m: ContainerMesh): void {
  plate(m, [[-1.8, -0.94], [0.64, -0.95], [1.58, -0.6], [1.64, 0.73],
    [0.5, 0.96], [-0.14, 0.73], [-1.68, 0.91]], -0.17, 0.17, C.plating);
  for (const x of [-1.16, -0.46, 0.26, 1.0]) {
    grates(m, x, 0.01, 0.45, 1.36);
  }
  for (const y of [-0.8, 0.8]) beam(m, -1.75, y, 1.55, y, 0.34, 0.14, C.rib);
  for (const x of [-1.45, -0.3, 1.12]) {
    m.box(x, -0.77, 0.24, 0.18, 0.14, 0.87, C.hull);
    m.box(x, 0.77, 0.24, 0.18, 0.14, 0.87, C.hull);
  }
  hatch(m, 0.93, 0.1, 0.77);
  cable(m, [[-1.71, 0.84], [-1.1, 0.6], [-0.7, 0.71], [-0.13, 0.46], [0.4, 0.55]], 0.57, C.cable);
  cable(m, [[-1.75, 0.67], [-1.22, 0.43], [-0.65, 0.59], [0.1, 0.31]], 0.61, C.coolant);
  plate(m, [[-1.8, -0.93], [-1.05, -1.12], [-0.78, -0.76], [-1.16, -0.59]], 0.45, 0.14, C.rust);
}

function buildDeck(m: ContainerMesh): void {
  plate(m, [[-1.94, -0.92], [-1.11, -1.13], [-0.6, -0.83], [0.6, -1.06],
    [1.81, -0.66], [1.56, 0.68], [0.93, 0.87], [0.28, 0.53],
    [-0.47, 1.07], [-1.74, 0.65]], -0.24, 0.17, C.hull);
  for (let i = -2; i <= 2; i += 1) grates(m, i * 0.56, -0.08, 0.47, 1.31);
  beam(m, -1.87, -0.71, 1.65, -0.69, 0.18, 0.12, C.caution);
  beam(m, -1.87, 0.72, 0.26, 0.72, 0.17, 0.12, C.caution);
  for (const x of [-1.51, -0.64, 0.25, 1.1]) {
    m.box(x, -0.74, 0.41, 0.09, 0.10, 0.70, C.brass);
    m.box(x, 0.67, 0.35, 0.09, 0.10, 0.58, C.brass);
  }
  beam(m, -1.51, -0.74, 1.1, -0.74, 0.82, 0.075, C.light);
  plate(m, [[1.0, -0.72], [1.93, -0.47], [1.42, 0.22], [1.17, 0.14]], 0.38, 0.18, C.plating);
  cable(m, [[-1.52, 0.59], [-0.8, 0.79], [-0.17, 0.92], [0.43, 0.71]], 0.23, C.cable);
}

function buildAirlock(m: ContainerMesh): void {
  const segments = 9;
  for (let i = 0; i < segments; i += 1) {
    if (i === 1 || i === 5) continue; // blasted-away structural ring sections
    const a = (Math.PI * 2 * i) / segments;
    const b = (Math.PI * 2 * (i + 1)) / segments;
    const x0 = Math.cos(a) * 1.26, y0 = Math.sin(a) * 1.08;
    const x1 = Math.cos(b) * 1.26, y1 = Math.sin(b) * 1.08;
    beam(m, x0, y0, x1, y1, 0.24, 0.28, C.hull);
    beam(m, x0 * 0.79, y0 * 0.79, x1 * 0.79, y1 * 0.79, 0.57, 0.14, C.light);
    beam(m, x0, y0, x0 * 0.79, y0 * 0.79, 0.6, 0.1, C.caution);
  }
  plate(m, [[-1.86, -0.69], [-1.07, -0.83], [-0.74, -0.52],
    [-1.01, 0.16], [-1.65, 0.09]], -0.15, 0.18, C.plating);
  plate(m, [[0.8, 0.69], [1.8, 0.67], [1.62, 1.11], [0.87, 1.24]], 0.36, 0.13, C.rust);
  m.box(0.59, 0.01, -0.06, 0.26, 0.99, 0.2, C.plating);
  for (const y of [-0.64, -0.42, 0.45, 0.65]) {
    beam(m, -1.35, y, -0.7, y, 0.53, 0.08, C.rib);
  }
  cable(m, [[1.15, 0.46], [1.57, 0.52], [1.91, 0.44], [2.08, 0.27]], 0.35, C.cable);
  cable(m, [[1.17, 0.39], [1.68, 0.23], [2.04, 0.06]], 0.39, C.coolant);
}

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
  plate(m, [[-2.33, -0.49], [-1.65, -0.67], [-1.29, -0.38],
    [-1.5, 0.03], [-2.23, 0.18]], 0.46, 0.14, C.plating);
  plate(m, [[1.18, 0.14], [1.87, 0.19], [2.18, 0.47], [1.37, 0.61]], 0.41, 0.14, C.rust);
  cable(m, [[-2.34, 0.16], [-1.68, 0.06], [-0.9, 0.14], [-0.19, 0.01],
    [0.78, 0.2], [1.55, 0.12], [2.45, 0.32]], 0.58, C.cable);
  cable(m, [[-2.2, -0.03], [-1.3, -0.1], [-0.16, -0.22], [0.72, -0.03],
    [1.74, -0.22]], 0.48, C.coolant);
}

function buildEngine(m: ContainerMesh): void {
  m.cylinder(0, 0, 0.15, 2.6, 0.64, C.hull);
  for (const x of [-1.06, -0.68, 0.26, 0.82, 1.16]) {
    m.cylinder(x, 0, 0.15, 0.11, 0.7, x > 0.7 ? C.rust : C.light);
  }
  m.cylinder(1.43, 0, 0.15, 0.23, 0.76, C.dark);
  for (let i = 0; i < 9; i += 1) {
    const angle = (i * Math.PI * 2) / 9;
    m.box(1.56, Math.cos(angle) * 0.51, 0.15 + Math.sin(angle) * 0.51,
      0.31, 0.14, 0.16, i % 2 ? C.hull : C.rust);
  }
  for (const y of [-0.77, 0.77]) {
    beam(m, -1.75, y, 1.17, y, -0.12, 0.17, C.rib);
    beam(m, -1.37, y * 1.17, -0.28, y * 0.92, 0.34, 0.12, C.light);
  }
  plate(m, [[-1.79, -0.93], [-0.94, -0.81], [-0.52, -0.48],
    [-1.55, -0.36]], 0.56, 0.16, C.plating);
  cable(m, [[-1.68, 0.63], [-1.06, 0.91], [-0.4, 0.75], [0.54, 0.95]], 0.48, C.cable);
  cable(m, [[-1.77, 0.53], [-0.78, 0.66], [-0.26, 0.82], [0.75, 0.67]], 0.55, C.coolant);
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
  plate(m, [[-1.85, -0.99], [-0.82, -1.06], [-0.6, -0.63],
    [-1.41, -0.31]], 0.48, 0.13, C.plating);
  plate(m, [[0.66, 0.5], [1.62, 0.39], [1.91, 1.02], [1.14, 1.18]], 0.44, 0.13, C.plating);
  for (const y of [-0.81, 0, 0.81]) {
    cable(m, [[-1.72, y], [-0.88, y + 0.12], [0.08, y + 0.05],
      [0.92, y + 0.17], [1.75, y + 0.24]], 0.79, y === 0 ? C.coolant : C.cable);
  }
}

function buildBulkhead(m: ContainerMesh): void {
  plate(m, [[-1.87, -0.85], [1.47, -1.03], [1.96, -0.3],
    [1.68, 0.81], [0.95, 0.97], [0.69, 0.66],
    [-1.09, 0.81], [-1.87, 0.34]], -0.13, 0.23, C.plating);
  for (const x of [-1.47, -0.9, 0.91, 1.51]) {
    m.box(x, 0, 0.24, 0.13, 1.73, 0.72, C.rib);
  }
  hatch(m, -0.12, 0.03, 1.28);
  for (const y of [-0.82, 0.83]) beam(m, -1.8, y, 1.62, y, 0.53, 0.15, C.hull);
  plate(m, [[0.89, -0.85], [1.95, -0.95], [1.61, -0.13], [1.05, -0.41]], 0.54, 0.09, C.rust);
  cable(m, [[1.34, 0.73], [1.64, 0.86], [2.12, 0.69], [2.33, 0.45]], 0.69, C.cable);
  cable(m, [[-1.66, -0.66], [-1.2, -0.84], [-0.59, -0.71]], 0.71, C.coolant);
}

function buildHabitation(m: ContainerMesh): void {
  plate(m, [[-1.83, -1], [1.6, -0.92], [1.87, -0.12],
    [1.26, 0.99], [-0.23, 0.75], [-1.78, 0.95]], -0.21, 0.21, C.hull);
  for (const x of [-1.2, -0.38, 0.43, 1.21]) grates(m, x, 0, 0.55, 1.4);
  beam(m, -1.8, -0.88, 1.55, -0.88, 0.36, 0.19, C.rib);
  beam(m, -1.8, 0.85, -0.24, 0.85, 0.38, 0.19, C.rib);
  for (const x of [-1.5, 0.8, 1.44]) m.box(x, -0.83, 0.38, 0.12, 0.16, 0.88, C.plating);
  hatch(m, 0.82, -0.38, 0.76);
  m.box(-0.85, 0.59, 0.39, 0.73, 0.25, 0.51, C.dark);
  m.box(-0.85, 0.6, 0.69, 0.54, 0.12, 0.06, C.glass);
  m.box(-0.49, 0.54, 0.73, 0.075, 0.075, 0.04, C.caution);
  cable(m, [[-1.75, 0.8], [-1.35, 0.59], [-0.78, 0.72], [0, 0.54],
    [0.36, 0.91]], 0.62, C.cable);
  plate(m, [[1.17, 0.15], [1.92, 0.1], [1.66, 0.76], [1.16, 0.65]], 0.44, 0.11, C.rust);
}

function makeMesh(variant: SalvageDebrisVariant): readonly Face[] {
  const mesh = new ContainerMesh();
  switch (variant) {
    case 'corridor': buildCorridor(mesh); break;
    case 'deck': buildDeck(mesh); break;
    case 'airlock': buildAirlock(mesh); break;
    case 'truss': buildTruss(mesh); break;
    case 'engine': buildEngine(mesh); break;
    case 'reactor': buildReactor(mesh); break;
    case 'bulkhead': buildBulkhead(mesh); break;
    case 'habitation': buildHabitation(mesh); break;
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

function compactMesh(variant: SalvageDebrisVariant): readonly Face[] {
  const m = new ContainerMesh();
  const long = variant === 'truss' || variant === 'engine';
  const round = variant === 'airlock' || variant === 'reactor';
  m.box(0, 0, 0, long ? 3.7 : 2.95, round ? 1.4 : 1.9, 0.38, C.hull);
  m.box(-0.38, -0.2, 0.24, 1.5, 0.24, 0.14, C.rib);
  m.box(0.7, 0.36, 0.26, 0.94, 0.18, 0.10, C.rust);
  return m.faces;
}

const compact = {
  corridor: compactMesh('corridor'),
  deck: compactMesh('deck'),
  airlock: compactMesh('airlock'),
  truss: compactMesh('truss'),
  engine: compactMesh('engine'),
  reactor: compactMesh('reactor'),
  bulkhead: compactMesh('bulkhead'),
  habitation: compactMesh('habitation'),
} satisfies Record<SalvageDebrisVariant, readonly Face[]>;

function effects(
  context: CanvasRenderingContext2D,
  part: SalvageDebris,
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
  if (part.variant === 'deck' || part.variant === 'truss' || part.variant === 'bulkhead')
    return;
  const breathe = 0.57 + 0.19 * Math.sin(timeSeconds * 0.92 + seed * 0.01);
  context.save();
  context.translate(-x, -y);
  context.rotate(angle + 0.43);
  for (let i = 0; i < 6; i += 1) {
    const shift = ((timeSeconds * 0.36 + i / 6 + seed * 0.00003) % 1);
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
  part: SalvageDebris,
  radius: number,
  timeSeconds: number
): void {
  drawProjectedSalvageMesh(
    context,
    radius < 12 ? compact[part.variant] : cached[part.variant],
    radius,
    part.rotation3d
  );
  if (radius >= 12) effects(context, part, radius, timeSeconds);
}
