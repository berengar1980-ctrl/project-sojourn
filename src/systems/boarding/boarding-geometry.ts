import type { BoardingHex, BoardingMapDefinition, BoardingUnit } from '../../core/boarding-types';

const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

export function boardingHexKey(q: number, r: number): string {
  return q + ',' + r;
}

export function boardingHexDistance(first: BoardingHex, second: BoardingHex): number {
  const firstY = -first.q - first.r;
  const secondY = -second.q - second.r;
  return Math.max(
    Math.abs(first.q - second.q),
    Math.abs(firstY - secondY),
    Math.abs(first.r - second.r)
  );
}

export function boardingHexNeighbours(
  map: BoardingMapDefinition,
  hex: BoardingHex
): readonly BoardingHex[] {
  return DIRECTIONS.map(([dq, dr]) => ({ q: hex.q + dq, r: hex.r + dr })).filter(
    (entry) => entry.q >= 0 && entry.r >= 0 && entry.q < map.columns && entry.r < map.rows
  );
}

export function boardingDoorAt(
  map: BoardingMapDefinition,
  q: number,
  r: number
): BoardingMapDefinition['doors'][number] | null {
  return map.doors.find((door) => door.q === q && door.r === r) ?? null;
}

export function boardingHexBlocked(
  map: BoardingMapDefinition,
  doorStates: Readonly<Record<string, boolean>>,
  q: number,
  r: number
): boolean {
  if (map.walls.includes(boardingHexKey(q, r))) return true;
  const door = boardingDoorAt(map, q, r);
  return door ? !doorStates[door.id] : false;
}

export function boardingUnitAt(
  units: readonly BoardingUnit[],
  q: number,
  r: number,
  ignoredUnitId?: string
): BoardingUnit | null {
  return (
    units.find(
      (unit) => unit.id !== ignoredUnitId && unit.hp > 0 && unit.q === q && unit.r === r
    ) ?? null
  );
}

interface CubePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function cubeRound(point: CubePoint): CubePoint {
  let x = Math.round(point.x);
  let y = Math.round(point.y);
  let z = Math.round(point.z);
  const xDiff = Math.abs(x - point.x);
  const yDiff = Math.abs(y - point.y);
  const zDiff = Math.abs(z - point.z);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff > zDiff) y = -x - z;
  else z = -x - y;
  return { x, y, z };
}

function lineHexes(first: BoardingHex, second: BoardingHex): readonly BoardingHex[] {
  const distance = boardingHexDistance(first, second);
  if (distance <= 1) return [];
  const a = { x: first.q, z: first.r, y: -first.q - first.r };
  const b = { x: second.q, z: second.r, y: -second.q - second.r };
  const result: BoardingHex[] = [];
  for (let step = 1; step < distance; step += 1) {
    const ratio = step / distance;
    const rounded = cubeRound({
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
      z: a.z + (b.z - a.z) * ratio,
    });
    result.push({ q: rounded.x, r: rounded.z });
  }
  return result;
}

export function boardingHasLineOfSight(
  map: BoardingMapDefinition,
  doorStates: Readonly<Record<string, boolean>>,
  first: BoardingHex,
  second: BoardingHex
): boolean {
  return !lineHexes(first, second).some((hex) => boardingHexBlocked(map, doorStates, hex.q, hex.r));
}

export function boardingTargetHasCover(
  map: BoardingMapDefinition,
  attacker: BoardingHex,
  target: BoardingHex
): boolean {
  if (map.cover.length === 0) return false;
  const directionQ = Math.sign(attacker.q - target.q);
  const directionR = Math.sign(attacker.r - target.r);
  return map.cover.some((cover) => {
    if (cover.q !== target.q || cover.r !== target.r) return false;
    const vector = DIRECTIONS[cover.side];
    return vector
      ? Math.sign(vector[0]) === directionQ && Math.sign(vector[1]) === directionR
      : false;
  });
}


/** Axial hex coordinates projected into a regular flat 2-D plane. */
export function boardingHexPlane(hex: BoardingHex): { x: number; y: number } {
  return { x: hex.q + hex.r * 0.5, y: hex.r * 0.8660254037844386 };
}

/** A 120-degree forward fire-watch sector, centred on the explicitly selected hex. */
export function boardingInOverwatchArc(
  source: BoardingHex,
  aim: BoardingHex,
  test: BoardingHex
): boolean {
  const first = boardingHexPlane(source);
  const second = boardingHexPlane(aim);
  const third = boardingHexPlane(test);
  const ax = second.x - first.x;
  const ay = second.y - first.y;
  const bx = third.x - first.x;
  const by = third.y - first.y;
  const magnitude = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return magnitude > 0 && (ax * bx + ay * by) / magnitude >= 0.5;
}

/** Fire-watchers do not deliberately fire through another member of their own team. */
export function boardingAllyInFiringLine(
  units: readonly BoardingUnit[],
  source: BoardingUnit,
  target: BoardingUnit
): boolean {
  return lineHexes(source, target).some((hex) =>
    units.some(
      (unit) =>
        unit.id !== source.id &&
        unit.hp > 0 &&
        unit.team === source.team &&
        unit.q === hex.q &&
        unit.r === hex.r
    )
  );
}
