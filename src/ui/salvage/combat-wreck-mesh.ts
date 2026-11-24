import type { CombatWreckVariant } from '../../core/salvage-types';
import { drawCachedSalvageMesh } from './salvage-mesh-lod-cache';
import {
  ContainerMesh,
  drawProjectedSalvageMesh,
  type Color,
  type Face,
  type Vec3,
} from './salvage-container-mesh';

/**
 * The five destroyed-ship silhouettes from the Sojourn wreck concept gallery.
 * Only combat-generated ship hulls use these geometries: regular salvage
 * containers, sections, asteroid meshes and intact ships stay untouched.
 *
 * Geometry is assembled once, then shared by the existing cached 2D projector.
 * No additional WebGL context or frame-time mesh allocations are introduced.
 */
const C = {
  hull: [47, 57, 62],
  plate: [91, 99, 104],
  steel: [122, 132, 135],
  dark: [22, 29, 33],
  char: [10, 13, 16],
  iron: [66, 75, 79],
} as const satisfies Record<string, Color>;

type Hull = readonly (readonly [number, number])[];

/** Ragged extruded plates: broken perimeter, rather than rectangular boxes. */
function shell(m: ContainerMesh, outline: Hull, z0: number, z1: number, color: Color): void {
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

function strut(
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

function ribs(m: ContainerMesh, from: number, to: number, width: number, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const x = from + ((to - from) * i) / Math.max(1, count - 1);
    strut(m, x, -width / 2, x + (i % 3) * 0.08, width / 2, 0.36, 0.065, i % 3 ? C.iron : C.steel);
    m.box(x, 0, -0.23, 0.08, width * 0.85, 0.12, C.dark);
  }
}

function soot(m: ContainerMesh, x: number, y: number, size: number): void {
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

function fragment(m: ContainerMesh, x: number, y: number, size: number, angle: number, color: Color): void {
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
    base.map(([px, py]) => [x + (px * c - py * s) * size, y + (px * s + py * c) * size]),
    -0.13,
    0.29,
    color
  );
  strut(m, x - size * 0.3, y - size * 0.08, x + size * 0.33, y + size * 0.09, 0.32, 0.035);
}

function scatter(m: ContainerMesh, count: number, spread: number, seed: number): void {
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

function freighter(m: ContainerMesh): void {
  // Large freight spine with its forward section ripped open.
  shell(m, [[-2.9,-.62],[-2.54,-1.01],[-1.78,-1.02],[-1.58,-.83],[.1,-.9],[.92,-.67],[1.06,-.35],[.55,-.22],[.89,.06],[.6,.71],[-.83,.84],[-1.2,.96],[-2.66,.84],[-2.97,.33]],-.35,.48,C.hull);
  shell(m,[[-2.65,-.61],[-1.02,-.71],[-.7,-.36],[-1.05,.14],[-2.53,.48]],.49,.59,C.plate);
  ribs(m,-.1,1.28,1.42,7);
  for(const y of [-.48,.48]) m.cylinder(-2.78,y,-.16,.6,.25,C.dark);
  strut(m,.4,-.52,1.84,-.8,.39,.09);
  strut(m,.15,.45,1.54,.96,.34,.07);
  soot(m,-.55,.42,.82);
  fragment(m,1.83,.92,1.18,.38,C.iron);
  fragment(m,2.4,-.42,.88,-.74,C.dark);
  fragment(m,-1.33,1.85,.93,.7,C.hull);
  scatter(m,12,2.55,.2);
}
function patrol(m: ContainerMesh): void {
  // Narrow interceptor, torn wing on one side and fractured engine cluster.
  shell(m,[[-2.5,-.37],[-1.96,-.53],[-.95,-.44],[-.43,-.3],[1.13,-.28],[2.36,0],[1.13,.3],[-.39,.43],[-1.57,.53],[-2.56,.38]],-.27,.4,C.hull);
  shell(m,[[-1.8,-.48],[-.36,-1.31],[.68,-1.7],[.94,-1.27],[-.23,-.42]],-.19,.15,C.iron);
  shell(m,[[-1.8,-.17],[-1.18,-.2],[.7,.18],[.1,.46],[-1.8,.41]],.41,.54,C.plate);
  ribs(m,.54,1.64,.54,5);
  m.cylinder(-2.4,0,0,.72,.27,C.dark);
  soot(m,.3,.3,.68);
  // Port wing is entirely separate.
  fragment(m,-.06,1.92,1.8,-.35,C.hull);
  strut(m,-.8,.49,-.17,.98,.3,.07);
  fragment(m,2.3,-1.32,.82,.8,C.dark);
  fragment(m,-2.55,-1.6,.7,.35,C.iron);
  scatter(m,14,2.65,1.12);
}
function oreCarrier(m: ContainerMesh): void {
  shell(m,[[-2.7,-.76],[-2.41,-1],[-1.12,-.89],[.26,-.94],[1.29,-.74],[1.49,-.3],[.83,.04],[1.51,.37],[.97,.94],[-.7,.82],[-2.63,.7]],-.4,.36,C.hull);
  for (const y of [-.93,.93]) {
    for (const x of [-1.65,-.55,.45]) {
      m.cylinder(x,y,-.08,.87,.37,C.dark);
      m.cylinder(x-.31,y,-.08,.11,.39,C.steel);
    }
  }
  ribs(m,-2.1,.87,1.5,8);
  soot(m,-.72,.3,1.04);
  strut(m,1.13,-.37,2.2,-.88,.32,.075);
  strut(m,1.08,.47,2.48,.97,.28,.075);
  fragment(m,1.46,1.73,1.45,.41,C.iron);
  fragment(m,2.48,-.71,1.17,-.9,C.hull);
  fragment(m,-2.03,-1.84,.98,.67,C.dark);
  scatter(m,14,2.66,.6);
}
function splitHull(m: ContainerMesh): void {
  // A clean open gap between the violently separated stern and prow.
  shell(m,[[-3.12,-.65],[-2.72,-.97],[-1.42,-.8],[-1.07,-.46],[-1.51,-.1],[-1.01,.22],[-1.57,.81],[-2.89,.74],[-3.1,.37]],-.42,.43,C.hull);
  shell(m,[[.94,-.48],[1.42,-.84],[2.4,-.62],[3.02,-.13],[2.89,.45],[2.22,.73],[1.27,.81],[.79,.3],[1.15,-.05]],-.31,.45,C.iron);
  shell(m,[[-2.87,-.6],[-1.77,-.66],[-1.52,-.26],[-2.72,.48]],.45,.56,C.plate);
  shell(m,[[1.47,-.51],[2.29,-.36],[2.51,.29],[1.58,.52]],.46,.55,C.plate);
  for(const y of [-.49,.49])m.cylinder(-2.95,y,-.11,.59,.24,C.dark);
  ribs(m,-1.52,-.84,1.12,5);
  ribs(m,.73,1.44,1.22,5);
  for(let i=0;i<8;i++) strut(m,-.94,(i-3.5)*.18,.57,(i-3.5)*.17,0.22,0.025,i%2?C.dark:C.steel);
  soot(m,1.85,.1,.73);
  fragment(m,.15,1.56,1.1,.7,C.hull);
  fragment(m,-.4,-1.7,.91,-.35,C.dark);
  scatter(m,13,2.6,2.45);
}
function barge(m: ContainerMesh): void {
  // Irregular, deliberately non-rectangular salvage craft.
  shell(m,[[-2.51,-.37],[-2.13,-.8],[-1.48,-.64],[-.94,-.9],[-.27,-.63],[.38,-.86],[1.22,-.58],[1.6,-.28],[1.16,.23],[1.79,.6],[.94,.78],[.15,.59],[-.7,.94],[-1.24,.53],[-2.03,.65],[-2.46,.14]],-.3,.38,C.dark);
  shell(m,[[-1.79,-.34],[-1.15,-.67],[-.44,-.41],[.42,-.52],[.82,-.12],[.51,.32],[-.15,.43],[-.8,.7],[-1.55,.28]],.4,.51,C.iron);
  for(let i=0;i<6;i++) strut(m,-1.67+i*.51,-.66,-1.39+i*.49,.77,.54,.045,i%2?C.steel:C.char);
  // Broken asymmetric grappling booms, spread out rather than box wings.
  strut(m,-.85,.5,-2.02,1.56,.23,.075);
  strut(m,-1.53,.46,-2.35,1.33,.25,.04);
  strut(m,.76,-.31,2.46,-1.47,.22,.08);
  strut(m,1.16,-.03,2.23,-1.21,.23,.042);
  strut(m,.97,.46,2.12,1.33,.27,.07);
  fragment(m,-1.91,1.71,1.03,-.47,C.hull);
  fragment(m,2.23,-1.52,.98,.25,C.iron);
  fragment(m,2.56,.92,.68,.82,C.dark);
  fragment(m,-2.45,-1.24,.84,-.7,C.steel);
  soot(m,-.51,.2,1.06);
  soot(m,1.11,.16,.5);
  scatter(m,16,2.63,1.6);
}

const BUILDERS = {
  'fractured-freighter': freighter,
  'shattered-patrol': patrol,
  'ore-carrier': oreCarrier,
  'split-hull': splitHull,
  'salvage-barge': barge,
} as const;

type NewVariant = keyof typeof BUILDERS;
const LEGACY: Readonly<Record<CombatWreckVariant, NewVariant>> = {
  'fractured-freighter': 'fractured-freighter',
  'shattered-patrol': 'shattered-patrol',
  'ore-carrier': 'ore-carrier',
  'split-hull': 'split-hull',
  'salvage-barge': 'salvage-barge',
  miner: 'ore-carrier',
  freighter: 'fractured-freighter',
  patrol: 'shattered-patrol',
};

function make(variant: NewVariant): readonly Face[] {
  const m = new ContainerMesh();
  BUILDERS[variant](m);
  return m.faces;
}
const meshes: Readonly<Record<NewVariant, readonly Face[]>> = {
  'fractured-freighter': make('fractured-freighter'),
  'shattered-patrol': make('shattered-patrol'),
  'ore-carrier': make('ore-carrier'),
  'split-hull': make('split-hull'),
  'salvage-barge': make('salvage-barge'),
};

/** One renderer used by destroyed combatants, fleet physical wrecks and salvage. */
export function drawCombatWreck3d(
  context: CanvasRenderingContext2D,
  variant: CombatWreckVariant,
  radius: number,
  rotation: { x: number; y: number; z: number }
): void {
  const current = LEGACY[variant];
  const geometry = meshes[current];
  if (
    radius >= 40 ||
    !drawCachedSalvageMesh(context, 'combat-wreck-v2:' + current, geometry, radius, rotation, 256)
  ) {
    drawProjectedSalvageMesh(context, geometry, radius, rotation);
  }
}
