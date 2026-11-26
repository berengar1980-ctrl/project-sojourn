import { DRONE_PATROL_SPEED, isSecurityDrone } from '../../core/security-drone';
import { resolveFieldDebrisContacts } from '../local-space/field-debris-contact';
import { createShieldWorldGeometry } from '../local-space/local-space-collision';
import { droneSeesTarget, securityPirateApproach } from '../operations/asteroid-security-drone';
import { seededLocalGate } from '../../core/local-space-exit';
import type { SectorNpcState } from '../../core/npc-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { getShipDefinition } from '../ships';
import {
  resolveShipShieldObstacleCollisions,
  resolveShipShieldCollisions,
  type LocalShieldShipBody,
  type ShipShieldCollision,
} from '../local-space/ship-shield-collision';
import {
  fieldInterceptRange,
  localArmedTraffic,
  npcMayTargetNpc,
  rivalPirateGroups,
} from './npc-combat-ai';
import { edgePoint, hashId } from './npc-mining-targets';
import {
  moveFieldShip,
  type FieldRouteShip,
  type FieldRouteState,
} from '../navigation/field-ship-routing';
import {
  stageLocalPirateCheckpoint,
  type LocalPirateCheckpoint,
} from './npc-local-pirate-checkpoint';

export interface LocalPirateContact {
  readonly npcId: string;
  readonly pirate: boolean;
  readonly pirateMark?: SectorNpcState['pirateMark'];
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

/** Resolve only exact overlapping spawn poses. Ordinary traffic separation
 * remains with the shared route planner; this is never run on duel ships.
 */
function separateCoincidentSpawn(
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

export class LocalPirateTraffic {
  private readonly ships = new Map<string, PirateRuntime>();
  private readonly combatReturnPositions = new Map<string, WorldPoint>();

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly seed: number
  ) {}

  matchesField(width: number, height: number, seed: number): boolean {
    return this.width === width && this.height === height && this.seed === seed;
  }

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

  body(id: string): FieldRouteShip | undefined {
    return this.ships.get(id);
  }

  snapshot(npcs: readonly SectorNpcState[]): LocalPirateContact[] {
    const byId = new Map(npcs.map((npc) => [npc.id, npc]));
    return [...this.ships.values()].flatMap((ship) => {
      const npc = byId.get(ship.npcId);
      if (!npc) return [];
      return [
        {
          npcId: npc.id,
          pirate: npc.pirate === true,
          ...(npc.pirate && {
            pirateMark:
              npc.pirateMark ?? (npc.factionId === 'pirates2' ? 'black-tide' : 'broken-spear'),
          }),
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
    const active = new Set<string>();
    for (const npc of pirates) if (availableLocalTraffic(npc)) active.add(npc.id);
    for (const [id, ship] of this.ships) {
      if (active.has(id)) continue;
      const npc = pirates.find((candidate) => candidate.id === id);
      if (keepCombatReturn(id, npc)) {
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
      const npc = pirates.find((entry) => entry.id === id);
      const spawnKey = isSecurityDrone(id) ? id + ':' + (npc?.combatDefeats ?? 0) : id;
      this.ships.set(id, {
        npcId: id,
        position:
          this.combatReturnPositions.get(id) ??
          edgePoint(spawnKey + ':' + this.seed, this.width, this.height),
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
    combatantId?: string,
    onFreighterExit?: (npc: SectorNpcState) => void
  ): void {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds));
    for (const pirate of this.ships.values()) {
      if (pirate.awaitingCombat || pirate.npcId === combatantId) continue;
      const npc = npcs.find((entry) => entry.id === pirate.npcId);
      // NPC-versus-NPC combat and recovery retain their field contact; normal
      // pirate traffic must not move or re-engage the active combatant.
      if (!npc || npc.hullHp <= 0 || npc.combatMovement || npc.combatRecoverySeconds) continue;
      separateCoincidentSpawn(pirate, this.ships);
      if (npc.job === 'freighter' && !npc.pirate) {
        this.advanceFreighter(pirate, npc, dt, asteroids, onFreighterExit);
        continue;
      }
      if (!npc.pirate) {
        this.advancePatrol(pirate, npcs, asteroids, dt, onIntercept);
        continue;
      }
      const target = this.nearestPrey(pirate, npc, npcs, miners, player);
      if (!target) continue;
      const distance = Math.hypot(
        target.position.x - pirate.position.x,
        target.position.y - pirate.position.y
      );
      if (distance <= fieldInterceptRange(npc.id, true)) {
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
      // Fly to interception distance. A worker can sit inside the navigation
      // clearance of its asteroid even while the approach corridor is clear.
      const standOff = Math.min(155, distance);
      const interceptPoint = {
        x: target.position.x + ((pirate.position.x - target.position.x) * standOff) / distance,
        y: target.position.y + ((pirate.position.y - target.position.y) * standOff) / distance,
      };
      let destination = interceptPoint;
      const previousTarget = pirate.routeState?.target;
      if (previousTarget) {
        const movement = Math.hypot(
          previousTarget.x - interceptPoint.x,
          previousTarget.y - interceptPoint.y
        );
        if (movement < 70) destination = previousTarget;
      }
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

  private nearestPrey(
    pirate: PirateRuntime,
    npc: SectorNpcState,
    npcs: readonly SectorNpcState[],
    miners: ReadonlyArray<{ npcId: string; position: WorldPoint; inCombat?: boolean }>,
    player: WorldPoint | null
  ) {
    const rivals = this.snapshot(
      npcs.filter((other) => rivalPirateGroups(npc, other) && npcMayTargetNpc(npc, other))
    );
    const targets = [
      ...rivals.map((other) => ({ id: other.npcId, position: other.position })),
      ...this.snapshot(
        npcs.filter(
          (other) =>
            other.job === 'freighter' &&
            npcMayTargetNpc(npc, other) &&
            other.smugglingProtectionFaction !== npc.factionId &&
            Object.values(other.cargo).some((amount) => amount > 0)
        )
      ).map((other) => ({ id: other.npcId, position: other.position })),
      ...miners
        .filter((miner) => !miner.inCombat && miner.npcId !== pirate.npcId)
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
    return targets[0];
  }
  private advanceFreighter(
    pirate: PirateRuntime,
    npc: SectorNpcState,
    dt: number,
    asteroids: readonly LocalAsteroid[],
    onFreighterExit?: (npc: SectorNpcState) => void
  ) {
    if (
      moveFieldShip(
        pirate,
        seededLocalGate(this.width, this.height, this.seed),
        110,
        dt,
        asteroids.filter((rock) => rock.routeBlocking),
        65,
        'patrol'
      )
    )
      onFreighterExit?.(npc);
  }
  private advancePatrol(
    ship: PirateRuntime,
    npcs: readonly SectorNpcState[],
    rocks: readonly LocalAsteroid[],
    dt: number,
    intercept: (attacker: string, target: string, position: WorldPoint) => boolean
  ): void {
    const drone = isSecurityDrone(ship.npcId);
    const hostiles = this.snapshot(
      npcs.filter(
        (npc) =>
          npc.pirate &&
          npc.hullHp > 0 &&
          (npc.combatRecoverySeconds ?? 0) <= 0 &&
          !npc.combatMovement
      )
    );
    const distance = (p: WorldPoint) => Math.hypot(p.x - ship.position.x, p.y - ship.position.y);
    const target = hostiles
      .filter((contact) =>
        drone
          ? droneSeesTarget(ship.position, contact.position, rocks)
          : distance(contact.position) < 650
      )
      .sort((a, b) => distance(a.position) - distance(b.position))[0];
    if (target && distance(target.position) <= fieldInterceptRange(ship.npcId, false)) {
      // The fleet coordinator will join the existing fight from this live pose.
      if (npcs.find((npc) => npc.id === target.npcId)?.combatMovement?.mode === 'engaged') return;
      if (intercept(ship.npcId, target.npcId, ship.position)) {
        ship.awaitingCombat = true;
        return;
      }
    }
    const pursuit =
      target && drone ? securityPirateApproach(ship.position, target.position) : target?.position;
    const blockers = rocks.filter((rock) => rock.routeBlocking);
    const bearing = Math.atan2(ship.position.y - this.height / 2, ship.position.x - this.width / 2);
    for (let step = 1; step <= 8; step++) {
      const angle = bearing + (step * Math.PI) / 4;
      const point = (step === 1 && (pursuit ?? ship.routeState?.target)) || {
        x: this.width * (0.5 + 0.3 * Math.cos(angle)),
        y: this.height * (0.5 + 0.3 * Math.sin(angle)),
      };
      const arrived = moveFieldShip(
        ship,
        point,
        drone ? DRONE_PATROL_SPEED : 118,
        dt,
        blockers,
        40,
        'patrol'
      );
      if (arrived || ship.routeState) return;
    }
  }

  /** Resolve solid pirate-to-ship shields after route movement. The duel owns
   * combatant poses, so only free-flying pirates participate.
   */
  resolveShipContacts(
    npcs: readonly SectorNpcState[],
    otherShips: readonly LocalShieldShipBody[],
    rocks: readonly LocalAsteroid[] = []
  ): readonly ShipShieldCollision[] {
    const byId = new Map(npcs.map((npc) => [npc.id, npc]));
    const pirateIds = new Set<string>();
    const pirates: LocalShieldShipBody[] = [];
    for (const pirate of this.ships.values()) {
      const npc = byId.get(pirate.npcId);
      if (
        !npc ||
        npc.hullHp <= 0 ||
        npc.combatMovement ||
        (npc.combatRecoverySeconds ?? 0) > 0 ||
        pirate.awaitingCombat
      )
        continue;
      const ship = getShipDefinition(npc.shipId);
      if (!ship) continue;
      pirateIds.add(pirate.npcId);
      pirates.push({ id: pirate.npcId, ship, state: pirate, pushWeight: 1 });
    }
    if (pirates.length === 0) return [];
    const impacts = resolveShipShieldCollisions(
      [...pirates, ...otherShips],
      (first, second) => pirateIds.has(first) || pirateIds.has(second)
    );
    for (const impact of impacts) {
      for (const id of [impact.firstId, impact.secondId]) {
        const pirate = this.ships.get(id);
        if (!pirate || !pirateIds.has(id)) continue;
        delete pirate.routeState;
        pirate.speed = 0;
        pirate.position = {
          x: Math.max(0, Math.min(this.width, pirate.position.x)),
          y: Math.max(0, Math.min(this.height, pirate.position.y)),
        };
      }
    }
    for (const body of pirates) {
      const traffic = this.ships.get(body.id)!;
      const geometry = createShieldWorldGeometry(
        body.ship.sprite.hardpoints,
        body.ship.nominalLengthMeters
      );
      const cos = Math.cos(traffic.headingRadians);
      const sin = Math.sin(traffic.headingRadians);
      resolveFieldDebrisContacts(
        {
          x: traffic.position.x + geometry.centerOffset.x * cos - geometry.centerOffset.y * sin,
          y: traffic.position.y + geometry.centerOffset.x * sin + geometry.centerOffset.y * cos,
        },
        { x: cos * traffic.speed, y: sin * traffic.speed },
        rocks,
        Math.max(geometry.radiusX, geometry.radiusY)
      );
    }
    resolveShipShieldObstacleCollisions(
      pirates,
      rocks
        .filter((rock) => rock.routeBlocking)
        .map((rock) => ({
          id: rock.id,
          position: rock.position,
          radius: rock.collisionRadius ?? rock.radius,
        }))
    );
    return impacts;
  }

  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number, speed = 0): void {
    const ship = this.ships.get(npcId);
    if (!ship) return;
    ship.position = { ...position };
    ship.headingRadians = headingRadians;
    ship.speed = speed;
    delete ship.routeState;
    // Keep the interception latch until the engagement has recovered.
  }
}

function availableLocalTraffic(npc: SectorNpcState): boolean {
  return Boolean(
    localArmedTraffic(npc) &&
    npc.hullHp > 0 &&
    (npc.combatRecoverySeconds ?? 0) <= 0 &&
    npc.retiredUntilDay === undefined &&
    (!npc.travel || npc.combatMovement)
  );
}

function keepCombatReturn(id: string, npc: SectorNpcState | undefined): boolean {
  return !isSecurityDrone(id) && Boolean(npc?.combatMovement || (npc?.combatRecoverySeconds ?? 0) > 0);
}
