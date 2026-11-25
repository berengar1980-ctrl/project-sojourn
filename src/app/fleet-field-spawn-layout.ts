import type { WorldPoint } from '../core/world-types';
import type { SectorNpcState } from '../core/npc-types';
import type { StrategicCombatArenaOptions } from '../systems/combat/strategic-combat-types';

type SpawnArena = Pick<StrategicCombatArenaOptions, 'width' | 'height' | 'asteroids'>;
const GRID_STEP = 95;
const FIELD_MARGIN = 150;
const OBSTACLE_CLEARANCE = 75;

function squaredDistance(a: WorldPoint, b: WorldPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function candidates(arena: SpawnArena): WorldPoint[] {
  const points: WorldPoint[] = [];
  const bodies = arena.asteroids ?? [];
  for (let x = FIELD_MARGIN; x <= arena.width - FIELD_MARGIN; x += GRID_STEP) {
    for (let y = FIELD_MARGIN; y <= arena.height - FIELD_MARGIN; y += GRID_STEP) {
      const point = { x, y };
      if (
        bodies.every(
          (body) => squaredDistance(point, body.position) >= (body.radius + OBSTACLE_CLEARANCE) ** 2
        )
      )
        points.push(point);
    }
  }
  return points;
}

function lanePreference(fraction: number, npc: SectorNpcState): number {
  if (!npc.pirate) return fraction >= 0.27 && fraction <= 0.73 ? 2 : 1;
  const distanceFromEdge = npc.pirateMark === 'black-tide' ? 1 - fraction : fraction;
  if (distanceFromEdge <= 0.24) return 2;
  return distanceFromEdge < 0.5 ? 1 : 0;
}

function spawnScore(
  point: WorldPoint,
  arena: SpawnArena,
  occupied: ReadonlyMap<string, WorldPoint>,
  npc?: SectorNpcState
): number {
  const center = { x: arena.width / 2, y: arena.height / 2 };
  if (!npc) return -squaredDistance(point, center);
  let nearest = Infinity;
  for (const other of occupied.values()) nearest = Math.min(nearest, squaredDistance(point, other));
  const lane = lanePreference(point.x / arena.width, npc);
  // Prefer the assigned lane while the nearest ship is still comfortably clear.
  return Math.min(nearest, 600 ** 2) + (nearest >= 170 ** 2 ? lane * arena.width ** 2 : 0);
}

/** Plan positions for the exercise only, including each reinforcement's entry lane. */
export function fleetFieldSpawns(
  arena: SpawnArena,
  arrivals: readonly { readonly npc: SectorNpcState }[]
): ReadonlyMap<string, WorldPoint> {
  const available = candidates(arena);
  const positions = new Map<string, WorldPoint>();
  for (const npc of [undefined, ...arrivals.map((entry) => entry.npc)]) {
    let selected = -1;
    let best = -Infinity;
    for (const [index, point] of available.entries()) {
      const score = spawnScore(point, arena, positions, npc);
      if (score <= best) continue;
      selected = index;
      best = score;
    }
    if (selected < 0) throw new Error('Kein freier Schiffsstartplatz im FleetCombat-Feld');
    positions.set(npc?.id ?? 'player', available.splice(selected, 1)[0]!);
  }
  return positions;
}
