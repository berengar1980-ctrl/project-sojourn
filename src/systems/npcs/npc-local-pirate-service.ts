import type { SectorNpcState } from '../../core/npc-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { edgePoint, hashId } from './npc-mining-targets';
import {
  stageLocalPirateCheckpoint,
  type LocalPirateCheckpoint,
} from './npc-local-pirate-checkpoint';

export interface LocalPirateContact {
  readonly npcId: string;
  readonly shipId: string;
  readonly name: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
}
interface PirateRuntime {
  readonly npcId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  awaitingCombat: boolean;
}

/**
 * A pirate must physically arrive in the sector field before appearing here.
 * Player attacks use the existing local AI battle; miner raids use background
 * strategic combat with the same asteroid arena.
 */
function pirateDestination(
  pirate: PirateRuntime,
  target: WorldPoint,
  asteroids: readonly LocalAsteroid[]
): WorldPoint {
  let destination = target;
  const directDx = destination.x - pirate.position.x;
  const directDy = destination.y - pirate.position.y;
  const directDistance2 = directDx * directDx + directDy * directDy;
  const barrier = asteroids
    .filter((rock) => rock.routeBlocking && rock.kind !== 'debris')
    .map((rock) => {
      const t =
        directDistance2 <= 1
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((rock.position.x - pirate.position.x) * directDx +
                  (rock.position.y - pirate.position.y) * directDy) /
                  directDistance2
              )
            );
      const px = pirate.position.x + directDx * t;
      const py = pirate.position.y + directDy * t;
      return { rock, t, clearance: Math.hypot(rock.position.x - px, rock.position.y - py) };
    })
    .find(
      (candidate) =>
        candidate.t > 0.02 && candidate.t < 0.95 && candidate.clearance < candidate.rock.radius + 38
    );
  if (barrier) {
    const side = hashId(pirate.npcId + barrier.rock.id) % 2 ? 1 : -1;
    const angle = Math.atan2(directDy, directDx) + (side * Math.PI) / 2;
    destination = {
      x: barrier.rock.position.x + Math.cos(angle) * (barrier.rock.radius + 115),
      y: barrier.rock.position.y + Math.sin(angle) * (barrier.rock.radius + 115),
    };
  }
  return destination;
}

function resolvePirateCollisions(
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

export class LocalPirateTraffic {
  private readonly ships = new Map<string, PirateRuntime>();
  private readonly combatReturnPositions = new Map<string, WorldPoint>();

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly seed: number
  ) {}

  /** Save authoritative local poses, pending engagements and combat return locations. */
  exportState(): LocalPirateCheckpoint {
    return {
      version: 1,
      width: this.width,
      height: this.height,
      seed: this.seed,
      ships: [...this.ships.values()].map((ship) => ({
        npcId: ship.npcId,
        position: { ...ship.position },
        headingRadians: ship.headingRadians,
        speed: ship.speed,
        awaitingCombat: ship.awaitingCombat,
      })),
      combatReturns: [...this.combatReturnPositions].map(
        ([id, position]) => [id, { ...position }] as const
      ),
    };
  }

  /** Construct new traffic independently; never alter a live field during staging. */
  static fromCheckpoint(
    width: number,
    height: number,
    seed: number,
    npcs: readonly SectorNpcState[],
    checkpoint: unknown
  ): LocalPirateTraffic {
    const saved = stageLocalPirateCheckpoint(checkpoint, width, height, seed, npcs);
    const instance = new LocalPirateTraffic(width, height, seed);
    for (const ship of saved.ships) {
      instance.ships.set(ship.npcId, {
        ...ship,
        position: { ...ship.position },
      });
    }
    for (const [id, position] of saved.combatReturns) {
      instance.combatReturnPositions.set(id, { ...position });
    }
    return instance;
  }

  snapshot(npcs: readonly SectorNpcState[]): LocalPirateContact[] {
    const byId = new Map(npcs.map((npc) => [npc.id, npc]));
    return [...this.ships.values()].flatMap((ship) => {
      const npc = byId.get(ship.npcId);
      if (!npc) return [];
      return [
        {
          npcId: npc.id,
          shipId: npc.shipId,
          name: npc.name,
          position: { ...ship.position },
          headingRadians: ship.headingRadians,
          speed: ship.speed,
        },
      ];
    });
  }

  reconcile(pirates: readonly SectorNpcState[], combatantId?: string): void {
    const active = new Set(
      pirates
        .filter(
          (npc) =>
            npc.pirate &&
            !npc.travel &&
            (!npc.combatMovement || npc.id === combatantId) &&
            npc.hullHp > 0 &&
            (!npc.combatRecoverySeconds || npc.id === combatantId)
        )
        .map((npc) => npc.id)
    );
    for (const [id, ship] of this.ships) {
      if (active.has(id)) continue;
      const npc = pirates.find((candidate) => candidate.id === id);
      if (npc?.combatMovement || (npc?.combatRecoverySeconds ?? 0) > 0) {
        this.combatReturnPositions.set(id, { ...ship.position });
      } else {
        this.combatReturnPositions.delete(id);
      }
      this.ships.delete(id);
    }
    for (const id of active) {
      if (this.ships.has(id)) continue;
      this.ships.set(id, {
        npcId: id,
        position:
          this.combatReturnPositions.get(id) ??
          edgePoint(id + ':' + this.seed, this.width, this.height),
        headingRadians: 0,
        speed: 0,
        awaitingCombat: false,
      });
      this.combatReturnPositions.delete(id);
    }
  }

  tick(
    deltaSeconds: number,
    npcs: readonly SectorNpcState[],
    player: WorldPoint | null,
    miners: ReadonlyArray<{ npcId: string; position: WorldPoint }>,
    asteroids: readonly LocalAsteroid[],
    onIntercept: (pirateId: string, targetId: string | 'player', position: WorldPoint) => boolean,
    combatantId?: string
  ): void {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds));
    for (const pirate of this.ships.values()) {
      if (pirate.awaitingCombat || pirate.npcId === combatantId) continue;
      const npc = npcs.find((entry) => entry.id === pirate.npcId);
      if (!npc || npc.hullHp <= 0) continue;
      const targets = [
        ...miners
          .filter((miner) => miner.npcId !== pirate.npcId)
          .map((miner) => ({
            id: miner.npcId,
            position: miner.position,
          })),
        ...(player ? [{ id: 'player', position: player }] : []),
      ];
      targets.sort(
        (a, b) =>
          Math.hypot(a.position.x - pirate.position.x, a.position.y - pirate.position.y) -
          Math.hypot(b.position.x - pirate.position.x, b.position.y - pirate.position.y)
      );
      const target = targets[0];
      if (!target) continue;
      const destination = pirateDestination(pirate, target.position, asteroids);
      const dx = destination.x - pirate.position.x;
      const dy = destination.y - pirate.position.y;
      const distance = Math.hypot(dx, dy);
      pirate.headingRadians = Math.atan2(dy, dx);
      if (distance < 210) {
        pirate.speed = 0;
        pirate.awaitingCombat = onIntercept(pirate.npcId, target.id, pirate.position);
        continue;
      }
      const speed = 128 + (hashId(pirate.npcId) % 24);
      const step = Math.min(distance, speed * dt);
      if (distance > 0) {
        pirate.position = {
          x: pirate.position.x + (dx / distance) * step,
          y: pirate.position.y + (dy / distance) * step,
        };
      }
      pirate.position = resolvePirateCollisions(
        pirate.position,
        asteroids,
        this.width,
        this.height
      );
      pirate.speed = speed;
    }
  }

  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number): void {
    const ship = this.ships.get(npcId);
    if (!ship) return;
    ship.position = { ...position };
    ship.headingRadians = headingRadians;
    ship.speed = 0;
    ship.awaitingCombat = false;
  }
}
