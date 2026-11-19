import type { SectorNpcState } from '../../core/npc-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { edgePoint, hashId } from './npc-mining-targets';
import { moveFieldShip, type FieldRouteState } from '../navigation/field-ship-routing';
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
  routeState?: FieldRouteState;
}

/**
 * A pirate must physically arrive in the sector field before appearing here.
 * Player attacks use the existing local AI battle; miner raids use background
 * strategic combat with the same asteroid arena.
 */
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
        ...(ship.routeState ? { routeState: structuredClone(ship.routeState) } : {}),
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
        ...(ship.routeState ? { routeState: structuredClone(ship.routeState) } : {}),
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

  reconcile(pirates: readonly SectorNpcState[], _combatantId?: string): void {
    const active = new Set(
      pirates
        .filter((npc) => npc.pirate && npc.hullHp > 0 && (!npc.travel || npc.combatMovement))
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
      const existing = this.ships.get(id);
      if (existing) {
        const npc = pirates.find((candidate) => candidate.id === id);
        // A local battle no longer deletes its ship. Release the interception
        // latch once the NPC has actually recovered from that engagement.
        if (npc && !npc.combatMovement && !npc.combatRecoverySeconds) {
          existing.awaitingCombat = false;
        }
        continue;
      }
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
    miners: ReadonlyArray<{ npcId: string; position: WorldPoint; inCombat?: boolean }>,
    asteroids: readonly LocalAsteroid[],
    onIntercept: (pirateId: string, targetId: string | 'player', position: WorldPoint) => boolean,
    combatantId?: string
  ): void {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds));
    for (const pirate of this.ships.values()) {
      if (pirate.awaitingCombat || pirate.npcId === combatantId) continue;
      const npc = npcs.find((entry) => entry.id === pirate.npcId);
      // NPC-versus-NPC combat and recovery retain their field contact; normal
      // pirate traffic must not move or re-engage the active combatant.
      if (!npc || npc.hullHp <= 0 || npc.combatMovement || npc.combatRecoverySeconds) continue;
      const targets = [
        ...miners
          .filter((miner) => miner.npcId !== pirate.npcId && !miner.inCombat)
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
      const distance = Math.hypot(
        target.position.x - pirate.position.x,
        target.position.y - pirate.position.y
      );
      if (distance < 210) {
        pirate.speed = 0;
        pirate.awaitingCombat = onIntercept(pirate.npcId, target.id, pirate.position);
        continue;
      }
      const speed = 128 + (hashId(pirate.npcId) % 24);
      // Moving traffic is also treated as solid route geometry. Never push
      // the pirate to an arbitrary position after A* has chosen a safe course:
      // that caused rapid back-and-forth jitter near working miners.
      const traffic = [
        ...[...this.ships.values()]
          .filter((other) => other.npcId !== pirate.npcId)
          .map((other) => ({
            id: other.npcId,
            position: other.position,
            radius: 40,
          })),
        ...miners
          .filter((miner) => miner.npcId !== target.id)
          .map((miner) => ({
            id: miner.npcId,
            position: miner.position,
            radius: 45,
          })),
      ];
      const previousTarget = pirate.routeState?.target;
      const destination =
        previousTarget && Math.hypot(
          previousTarget.x - target.position.x,
          previousTarget.y - target.position.y
        ) < 70
          ? previousTarget
          : target.position;
      moveFieldShip(
        pirate,
        destination,
        speed,
        dt,
        [...asteroids.filter((rock) => rock.routeBlocking), ...traffic],
        65
      );
      pirate.position = resolvePirateCollisions(
        pirate.position,
        asteroids,
        this.width,
        this.height
      );
      pirate.position = {
        x: Math.max(0, Math.min(this.width, pirate.position.x)),
        y: Math.max(0, Math.min(this.height, pirate.position.y)),
      };
    }
  }

  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number): void {
    const ship = this.ships.get(npcId);
    if (!ship) return;
    ship.position = { ...position };
    ship.headingRadians = headingRadians;
    ship.speed = 0;
    delete ship.routeState;
    // Keep the interception latch until the engagement has recovered.
  }
}
