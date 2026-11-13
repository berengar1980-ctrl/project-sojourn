import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { edgePoint, hashId } from './npc-mining-targets';

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
export class LocalPirateTraffic {
  private readonly ships = new Map<string, PirateRuntime>();

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly seed: number
  ) {}

  snapshot(npcs: readonly SectorNpcState[]): LocalPirateContact[] {
    const byId = new Map(npcs.map((npc) => [npc.id, npc]));
    return [...this.ships.values()].flatMap((ship) => {
      const npc = byId.get(ship.npcId);
      if (!npc) return [];
      return [{
        npcId: npc.id,
        shipId: npc.shipId,
        name: npc.name,
        position: { ...ship.position },
        headingRadians: ship.headingRadians,
        speed: ship.speed,
      }];
    });
  }

  reconcile(pirates: readonly SectorNpcState[]): void {
    const active = new Set(pirates.filter(
      (npc) => npc.pirate && !npc.travel && !npc.combatMovement &&
        npc.hullHp > 0 && !npc.combatRecoverySeconds
    ).map((npc) => npc.id));
    for (const id of this.ships.keys()) if (!active.has(id)) this.ships.delete(id);
    for (const id of active) {
      if (this.ships.has(id)) continue;
      this.ships.set(id, {
        npcId: id,
        position: edgePoint(id + ':' + this.seed, this.width, this.height),
        headingRadians: 0,
        speed: 0,
        awaitingCombat: false,
      });
    }
  }

  tick(
    deltaSeconds: number,
    npcs: readonly SectorNpcState[],
    player: WorldPoint,
    miners: ReadonlyArray<{ npcId: string; position: WorldPoint }>,
    onIntercept: (pirateId: string, targetId: string | 'player', position: WorldPoint) => boolean
  ): void {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds));
    for (const pirate of this.ships.values()) {
      if (pirate.awaitingCombat) continue;
      const npc = npcs.find((entry) => entry.id === pirate.npcId);
      if (!npc || npc.hullHp <= 0) continue;
      const targets = [
        ...miners.filter((miner) => miner.npcId !== pirate.npcId).map((miner) => ({
          id: miner.npcId, position: miner.position,
        })),
        { id: 'player', position: player },
      ];
      targets.sort((a, b) =>
        Math.hypot(a.position.x - pirate.position.x, a.position.y - pirate.position.y) -
        Math.hypot(b.position.x - pirate.position.x, b.position.y - pirate.position.y)
      );
      const target = targets[0];
      if (!target) continue;
      const dx = target.position.x - pirate.position.x;
      const dy = target.position.y - pirate.position.y;
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
