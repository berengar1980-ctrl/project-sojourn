import { pirateGroupMark } from '../../core/pirate-ports';
import {
  resolvePirateCollisions,
  separateCoincidentSpawn,
  type PirateRuntime,
  standalonePirateObstacles,
} from './npc-local-pirate-geometry';
import { DRONE_PATROL_SPEED, isSecurityDrone } from '../../core/security-drone';
import { resolveShipFieldDebrisContacts } from '../local-space/field-debris-contact';
import { solidFieldRockObstacles } from '../local-space/local-asteroid-footprint';
import { droneSeesTarget, securityPirateApproach } from '../operations/asteroid-security-drone';
import { seededLocalGate } from '../../core/local-space-exit';
import { fieldGateAvailable } from './npc-local-field-arrivals';
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
  protectedFromPirate,
  rivalPirateGroups,
} from './npc-combat-ai';
import { edgePoint, hashId } from './npc-mining-targets';
import {
  moveFieldShip,
  type FieldRouteObstacle,
  type FieldRouteShip,
} from '../navigation/field-ship-routing';
import type { FieldTrafficProvider } from '../navigation/field-traffic-obstacles';
import {
  stageLocalPirateCheckpoint,
  type LocalPirateCheckpoint,
} from './npc-local-pirate-checkpoint';
import {
  ensurePhysicalShipVelocity,
  type ManeuveringShipControls,
} from '../../core/physical-ship-state';
import { setLocalNpcPhysicalPose } from './npc-local-physical-pose';

export interface LocalPirateContact {
  readonly npcId: string;
  readonly pirate: boolean;
  readonly pirateMark?: SectorNpcState['pirateMark'];
  readonly shipId: string;
  readonly name: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly velocity: WorldPoint;
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

  exportState(): LocalPirateCheckpoint {
    return {
      version: 1,
      width: this.width,
      height: this.height,
      seed: this.seed,
      ships: [...this.ships.values()].map((ship) => ({
        ...ship,
        position: { ...ship.position },
        velocity: { ...ship.velocity },
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
      const restored = {
        ...ship,
        position: { ...ship.position },
        ...(ship.routeState ? { routeState: structuredClone(ship.routeState) } : {}),
      };
      ensurePhysicalShipVelocity(restored);
      instance.ships.set(ship.npcId, restored);
    }
    for (const [id, position] of saved.combatReturns) {
      instance.combatReturnPositions.set(id, { ...position });
    }
    return instance;
  }

  body(id: string): FieldRouteShip | undefined {
    return this.ships.get(id);
  }

  /** Synchronous navigation visitor: no render metadata or position copies. */
  visitBodies(visit: (id: string, body: FieldRouteShip) => void): void {
    for (const ship of this.ships.values()) visit(ship.npcId, ship);
  }

  snapshot(
    npcs: readonly SectorNpcState[],
    index?: ReadonlyMap<string, SectorNpcState>
  ): LocalPirateContact[] {
    if (this.ships.size === 0) return [];
    const byId = index ?? new Map(npcs.map((npc) => [npc.id, npc]));
    const contacts: LocalPirateContact[] = [];
    for (const ship of this.ships.values()) {
      const npc = byId.get(ship.npcId);
      if (!npc) continue;
      contacts.push({
        npcId: npc.id,
        pirate: npc.pirate === true,
        ...(npc.pirate && {
          pirateMark: npc.pirateMark ?? pirateGroupMark(npc.factionId),
        }),
        shipId: npc.shipId,
        name: npc.name,
        position: { ...ship.position },
        headingRadians: ship.headingRadians,
        speed: ship.speed,
        velocity: { ...ship.velocity },
      });
    }
    return contacts;
  }

  reconcile(
    pirates: readonly SectorNpcState[],
    _combatantId?: string,
    provider?: FieldTrafficProvider
  ): void {
    const active = new Set<string>();
    const byId = new Map<string, SectorNpcState>();
    for (const npc of pirates) {
      if (!byId.has(npc.id)) byId.set(npc.id, npc);
      if (availableLocalTraffic(npc)) active.add(npc.id);
    }
    for (const [id, ship] of this.ships) {
      if (active.has(id)) continue;
      const npc = byId.get(id);
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
        const npc = byId.get(id);
        // A local battle no longer deletes its ship. Release the interception
        // latch once the NPC has actually recovered from that engagement.
        if (npc && !npc.combatMovement && !npc.combatRecoverySeconds) {
          existing.awaitingCombat = false;
        }
        continue;
      }
      const npc = byId.get(id);
      const spawnKey = isSecurityDrone(id) ? id + ':' + (npc?.combatDefeats ?? 0) : id;
      const returning = this.combatReturnPositions.get(id);
      const position = returning ?? edgePoint(spawnKey + ':' + this.seed, this.width, this.height);
      if (
        npc &&
        !returning &&
        !npc.combatMovement &&
        !fieldGateAvailable(id, npc.shipId, position, [], provider)
      )
        continue;
      this.ships.set(id, {
        npcId: id,
        position,
        headingRadians: 0,
        velocity: { x: 0, y: 0 },
        turnRateRadiansPerSecond: 0,
        angularThrust: 0,
        lateralThrust: 0,
        longitudinalThrust: 0,
        get speed() {
          return Math.hypot(this.velocity.x, this.velocity.y);
        },
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
    onFreighterExit?: (npc: SectorNpcState) => void,
    getTrafficObstacles?: FieldTrafficProvider
  ): void {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds));
    for (const pirate of this.ships.values()) {
      if (pirate.awaitingCombat || pirate.npcId === combatantId) continue;
      const npc = npcs.find((entry) => entry.id === pirate.npcId);
      // NPC-versus-NPC combat and recovery retain their field contact; normal
      // pirate traffic must not move or re-engage the active combatant.
      if (!npc || npc.hullHp <= 0 || npc.combatMovement || npc.combatRecoverySeconds) continue;
      if (!getTrafficObstacles) separateCoincidentSpawn(pirate, this.ships);
      const obstacles = getTrafficObstacles?.(pirate.npcId);
      if (npc.job === 'freighter' && !npc.pirate) {
        this.advanceFreighter(pirate, npc, dt, asteroids, onFreighterExit, obstacles);
        continue;
      }
      if (!npc.pirate) {
        this.advancePatrol(pirate, npcs, asteroids, dt, onIntercept, obstacles);
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
      const traffic = obstacles
        ? obstacles.filter((other) => other.id !== target.id)
        : standalonePirateObstacles(pirate.npcId, target.id, this.ships, miners);
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
    }
  }

  private nearestPrey(
    pirate: PirateRuntime,
    npc: SectorNpcState,
    npcs: readonly SectorNpcState[],
    miners: ReadonlyArray<{ npcId: string; position: WorldPoint; inCombat?: boolean }>,
    player: WorldPoint | null
  ) {
    const byId = new Map(npcs.map((other) => [other.id, other]));
    let nearest: { id: string; position: WorldPoint } | undefined;
    let bestDistance = Infinity;
    const consider = (id: string, position: WorldPoint): void => {
      const distance = Math.hypot(position.x - pirate.position.x, position.y - pirate.position.y);
      if (!nearest || distance < bestDistance) {
        nearest = { id, position };
        bestDistance = distance;
      }
    };
    // Preserve the original stable sort's tie order: rivals, loaded freighters,
    // workers, then the player. Map iteration is the snapshot's original order.
    for (const ship of this.ships.values()) {
      const other = byId.get(ship.npcId);
      if (other && rivalPirateGroups(npc, other) && npcMayTargetNpc(npc, other))
        consider(other.id, ship.position);
    }
    for (const ship of this.ships.values()) {
      const other = byId.get(ship.npcId);
      if (
        other &&
        other.job === 'freighter' &&
        npcMayTargetNpc(npc, other) &&
        !protectedFromPirate(npc, other) &&
        Object.values(other.cargo).some((amount) => amount > 0)
      )
        consider(other.id, ship.position);
    }
    for (const miner of miners) {
      const worker = byId.get(miner.npcId);
      if (miner.inCombat || miner.npcId === pirate.npcId) continue;
      if (worker && protectedFromPirate(npc, worker)) continue;
      consider(miner.npcId, miner.position);
    }
    if (player) consider('player', player);
    return nearest;
  }
  private advanceFreighter(
    pirate: PirateRuntime,
    npc: SectorNpcState,
    dt: number,
    asteroids: readonly LocalAsteroid[],
    onFreighterExit?: (npc: SectorNpcState) => void,
    traffic: readonly FieldRouteObstacle[] = []
  ) {
    if (
      moveFieldShip(
        pirate,
        seededLocalGate(this.width, this.height, this.seed),
        110,
        dt,
        [...asteroids.filter((rock) => rock.routeBlocking), ...traffic],
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
    intercept: (attacker: string, target: string, position: WorldPoint) => boolean,
    traffic: readonly FieldRouteObstacle[] = []
  ): void {
    const drone = isSecurityDrone(ship.npcId);
    const hostiles = this.snapshot(
      npcs.filter(
        (npc) =>
          npc.pirate &&
          npc.hullHp > 0 &&
          (npc.combatRecoverySeconds ?? 0) <= 0 &&
          (!npc.combatMovement || (drone && npc.combatMovement.mode === 'engaged'))
      )
    );
    const distance = (p: WorldPoint) => Math.hypot(p.x - ship.position.x, p.y - ship.position.y);
    const visible = hostiles
      .filter((contact) =>
        drone
          ? droneSeesTarget(ship.position, contact.position, rocks)
          : distance(contact.position) < 650
      )
      .sort((a, b) => distance(a.position) - distance(b.position));
    const target =
      visible.find((contact) => !npcs.find((npc) => npc.id === contact.npcId)?.combatMovement) ??
      visible[0];
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
    const blockers = [
      ...rocks.filter((rock) => rock.routeBlocking),
      ...traffic.filter((other) => other.id !== target?.npcId),
    ];
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
        pirate.velocity = { x: 0, y: 0 };
        pirate.position = {
          x: Math.max(0, Math.min(this.width, pirate.position.x)),
          y: Math.max(0, Math.min(this.height, pirate.position.y)),
        };
      }
    }
    for (const body of pirates) {
      const traffic = this.ships.get(body.id)!;
      resolveShipFieldDebrisContacts(body.ship, traffic, rocks);
    }
    resolveShipShieldObstacleCollisions(pirates, solidFieldRockObstacles(rocks));
    return impacts;
  }

  syncCombatPose(
    npcId: string,
    position: WorldPoint,
    headingRadians: number,
    velocity: WorldPoint,
    maneuvering?: Partial<ManeuveringShipControls>
  ): void {
    const ship = this.ships.get(npcId);
    if (!ship) return;
    setLocalNpcPhysicalPose(ship, position, headingRadians, velocity, maneuvering);
    delete ship.routeState;
    // Keep the interception latch until the engagement has recovered.
  }
}

function availableLocalTraffic(npc: SectorNpcState): boolean {
  return Boolean(
    localArmedTraffic(npc) &&
    npc.hullHp > 0 &&
    (!isSecurityDrone(npc.id) || (npc.combatRecoverySeconds ?? 0) <= 0) &&
    npc.retiredUntilDay === undefined &&
    (!npc.travel || npc.combatMovement)
  );
}

function keepCombatReturn(id: string, npc: SectorNpcState | undefined): boolean {
  return (
    !isSecurityDrone(id) && Boolean(npc?.combatMovement || (npc?.combatRecoverySeconds ?? 0) > 0)
  );
}
