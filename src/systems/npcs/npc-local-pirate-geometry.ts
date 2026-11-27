import type { WorldPoint } from '../../core/world-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { FieldRouteObstacle, FieldRouteState } from '../navigation/field-ship-routing';
import { hashId } from './npc-mining-targets';

export interface PirateRuntime {
  readonly npcId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  awaitingCombat: boolean;
  routeState?: FieldRouteState;
}

/**
 * A pirate must physically arrive in the sector field before appearing here.
 * Player attacks use the existing local AI battle; miner raids use background
 * strategic combat with the same asteroid arena.
 */
export function resolvePirateCollisions(
  position: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  width: number,
  height: number
): WorldPoint {
  let result = { ...position };
  for (const rock of asteroids) {
    if (!rock.routeBlocking) continue;
    const dx = result.x - rock.position.x;
    const dy = result.y - rock.position.y;
    const gap = Math.hypot(dx, dy);
    const minimum = rock.radius + 35;
    if (gap >= minimum) continue;
    const ux = gap > 0 ? dx / gap : 1;
    const uy = gap > 0 ? dy / gap : 0;
    result = {
      x: rock.position.x + ux * minimum,
      y: rock.position.y + uy * minimum,
    };
  }
  return { x: Math.max(0, Math.min(width, result.x)), y: Math.max(0, Math.min(height, result.y)) };
}

/** Resolve only exact overlapping spawn poses. Ordinary traffic separation
 * remains with the shared route planner; this is never run on duel ships.
 */
export function separateCoincidentSpawn(
  pirate: PirateRuntime,
  others: ReadonlyMap<string, PirateRuntime>
): void {
  for (const other of others.values()) {
    if (other.npcId === pirate.npcId || other.awaitingCombat) continue;
    const gap = Math.hypot(
      pirate.position.x - other.position.x,
      pirate.position.y - other.position.y
    );
    if (gap > 1) continue;
    const heading = (hashId(pirate.npcId + ':' + other.npcId) % 6283) / 1000;
    pirate.position = {
      x: other.position.x + Math.cos(heading) * 100,
      y: other.position.y + Math.sin(heading) * 100,
    };
    delete pirate.routeState;
  }
}

/** Standalone callers without a field authority retain their original routing inputs. */
export function standalonePirateObstacles(
  selfId: string,
  targetId: string,
  ships: ReadonlyMap<string, PirateRuntime>,
  workers: ReadonlyArray<{ npcId: string; position: WorldPoint }>
): FieldRouteObstacle[] {
  return [
    ...[...ships.values()]
      .filter((other) => other.npcId !== selfId)
      .map((other) => ({ id: other.npcId, position: other.position, radius: 40 })),
    ...workers
      .filter((worker) => worker.npcId !== targetId)
      .map((worker) => ({ id: worker.npcId, position: worker.position, radius: 45 })),
  ];
}
