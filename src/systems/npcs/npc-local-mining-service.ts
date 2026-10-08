import type {
  LocalAsteroid,
  LocalShipState,
  MiningEventChoice,
} from '../../core/local-space-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { WorldPoint } from '../../core/world-types';
import { createMiningEventController } from '../local-space/mining-event-service';
import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';
import { getShipDefinition } from '../ships';

export type LocalNpcMiningPhase = 'entering' | 'approaching' | 'scanning' | 'mining' | 'exiting';

export interface LocalNpcMinerState {
  readonly npcId: string;
  readonly name: string;
  readonly shipId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  phase: LocalNpcMiningPhase;
  targetAsteroidId: string | null;
  laserActive: boolean;
  scanProgress: number;
  readonly entryPoint: WorldPoint;
  exitPoint: WorldPoint;
  miningAccumulator: number;
}

export interface NpcLocalMiningService {
  readonly ships: readonly LocalNpcMinerState[];
  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number, speed: number): void;
  tick(deltaSeconds: number): void;
}

export interface NpcLocalMiningOptions {
  readonly locationId: string;
  readonly width: number;
  readonly height: number;
  readonly miners: readonly SectorNpcState[];
  readonly getAsteroids: () => readonly LocalAsteroid[];
  readonly mine: (npc: SectorNpcState, resourceId: string, requested: number) => number;
  readonly depart: (npc: SectorNpcState) => boolean;
  readonly playerShip?: ShipDefinition;
  readonly getPlayerShipState?: () => LocalShipState;
}

const ENTRY_MARGIN = 18;
const EXIT_MARGIN = 90;
const APPROACH_DISTANCE = 105;
const FLIGHT_SPEED = 92;
const SCAN_SECONDS = 5;
const MINING_CYCLE_SECONDS = 1.15;
const MINING_AMOUNT = 4;

function hashId(id: string): number {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function edgePoint(id: string, width: number, height: number, outside = false): WorldPoint {
  const hash = hashId(id);
  const side = hash % 4;
  const t = ((hash >>> 3) % 1000) / 1000;
  const margin = outside ? EXIT_MARGIN : ENTRY_MARGIN;
  if (side === 0) return { x: outside ? -margin : margin, y: height * (0.15 + t * 0.7) };
  if (side === 1) return { x: width - (outside ? -margin : margin), y: height * (0.15 + t * 0.7) };
  if (side === 2) return { x: width * (0.15 + t * 0.7), y: outside ? -margin : margin };
  return { x: width * (0.15 + t * 0.7), y: height - (outside ? -margin : margin) };
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function moveToward(
  ship: LocalNpcMinerState,
  target: WorldPoint,
  speed: number,
  dt: number
): boolean {
  const dx = target.x - ship.position.x;
  const dy = target.y - ship.position.y;
  const remaining = Math.hypot(dx, dy);
  ship.headingRadians = Math.atan2(dy, dx);
  ship.speed = speed;
  if (remaining <= Math.max(2, speed * dt)) {
    ship.position = { ...target };
    ship.speed = 0;
    return true;
  }
  ship.position = {
    x: ship.position.x + (dx / remaining) * speed * dt,
    y: ship.position.y + (dy / remaining) * speed * dt,
  };
  return false;
}

function cargoUsed(npc: SectorNpcState): number {
  return Object.values(npc.cargo).reduce((sum, amount) => sum + Math.max(0, Math.floor(amount)), 0);
}

function chooseAsteroid(
  npc: SectorNpcState,
  asteroids: readonly LocalAsteroid[],
  occupied: ReadonlySet<string>
): LocalAsteroid | null {
  const preferred = asteroids.filter(
    (asteroid) =>
      asteroid.kind === 'resource' &&
      !occupied.has(asteroid.id) &&
      asteroid.deposits.some(
        (deposit) =>
          deposit.oreRemaining > 0 &&
          (npc.workResourceIds.length === 0 || npc.workResourceIds.includes(deposit.resourceId))
      )
  );
  const fallback = asteroids.filter(
    (asteroid) =>
      asteroid.kind === 'resource' &&
      !occupied.has(asteroid.id) &&
      asteroid.deposits.some((deposit) => deposit.oreRemaining > 0)
  );
  const pool = preferred.length > 0 ? preferred : fallback;
  if (pool.length === 0) return null;
  return (
    [...pool].sort(
      (first, second) =>
        distance(first.position, { x: 2200, y: 1285 }) -
          distance(second.position, { x: 2200, y: 1285 }) || first.id.localeCompare(second.id)
    )[hashId(npc.id) % Math.min(8, pool.length)] ??
    pool[0] ??
    null
  );
}

function approachPoint(npcId: string, asteroid: LocalAsteroid): WorldPoint {
  const angle = ((hashId(npcId + ':' + asteroid.id) % 6283) / 1000) % (Math.PI * 2);
  const radius = asteroid.radius + APPROACH_DISTANCE;
  return {
    x: asteroid.position.x + Math.cos(angle) * radius,
    y: asteroid.position.y + Math.sin(angle) * radius,
  };
}

function eligibleMiner(npc: SectorNpcState, locationId: string): boolean {
  return (
    npc.job === 'miner' &&
    npc.workLocationId === locationId &&
    npc.locationId === locationId &&
    !npc.travel &&
    npc.autonomy?.phase === 'working' &&
    cargoUsed(npc) < Math.max(1, Math.floor(npc.cargoCapacity))
  );
}

function chooseEventChoice(
  npc: SectorNpcState,
  choices: readonly MiningEventChoice[]
): MiningEventChoice | null {
  if (choices.length === 0) return null;
  const rank = { safe: 0, controlled: 1, risky: 2, high_risk: 3 } as const;
  const risky = npc.workRiskPreference === 'risky';
  return (
    [...choices].sort((a, b) =>
      risky ? rank[b.risk] - rank[a.risk] : rank[a.risk] - rank[b.risk]
    )[0] ?? null
  );
}

interface MinerRuntime {
  readonly options: NpcLocalMiningOptions;
  readonly ships: LocalNpcMinerState[];
  readonly byId: Map<string, SectorNpcState>;
  readonly events: Map<string, ReturnType<typeof createMiningEventController>>;
}

function beginExit(runtime: MinerRuntime, ship: LocalNpcMinerState): void {
  ship.phase = 'exiting';
  ship.targetAsteroidId = null;
  ship.laserActive = false;
  ship.scanProgress = 0;
  ship.exitPoint = edgePoint(ship.npcId + ':exit', runtime.options.width, runtime.options.height, true);
}

function syncArrivals(runtime: MinerRuntime): void {
  const active = new Set(runtime.ships.map((ship) => ship.npcId));
  for (const npc of runtime.options.miners) {
    if (active.has(npc.id) || !eligibleMiner(npc, runtime.options.locationId)) continue;
    const entry = edgePoint(npc.id, runtime.options.width, runtime.options.height, false);
    runtime.ships.push({
      npcId: npc.id,
      name: npc.name,
      shipId: npc.shipId,
      position: { ...entry },
      headingRadians: 0,
      speed: FLIGHT_SPEED,
      phase: 'entering',
      targetAsteroidId: null,
      laserActive: false,
      scanProgress: 0,
      entryPoint: entry,
      exitPoint: edgePoint(npc.id + ':exit', runtime.options.width, runtime.options.height, true),
      miningAccumulator: 0,
    });
  }
}

function assignTarget(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState
): boolean {
  const occupied = new Set(
    runtime.ships
      .filter((candidate) => candidate.npcId !== ship.npcId && candidate.targetAsteroidId)
      .map((candidate) => candidate.targetAsteroidId as string)
  );
  const asteroid = chooseAsteroid(npc, runtime.options.getAsteroids(), occupied);
  if (!asteroid) {
    beginExit(runtime, ship);
    return false;
  }
  ship.targetAsteroidId = asteroid.id;
  ship.phase = 'entering';
  ship.laserActive = false;
  ship.scanProgress = 0;
  return true;
}

function mine(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState,
  asteroid: LocalAsteroid
): void {
  const deposit =
    asteroid.deposits.find(
      (candidate) =>
        candidate.oreRemaining > 0 &&
        (npc.workResourceIds.length === 0 || npc.workResourceIds.includes(candidate.resourceId))
    ) ?? asteroid.deposits.find((candidate) => candidate.oreRemaining > 0);
  if (!deposit) {
    assignTarget(runtime, ship, npc);
    return;
  }

  const requested = Math.min(MINING_AMOUNT, deposit.oreRemaining);
  const accepted = runtime.options.mine(npc, deposit.resourceId, requested);
  if (accepted > 0) deposit.oreRemaining = Math.max(0, deposit.oreRemaining - accepted);
  if (accepted <= 0 || cargoUsed(npc) >= Math.floor(npc.cargoCapacity)) {
    beginExit(runtime, ship);
  } else if (!asteroid.deposits.some((candidate) => candidate.oreRemaining > 0)) {
    assignTarget(runtime, ship, npc);
  }
}

function resolvePendingEvent(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState,
  asteroid: LocalAsteroid
): boolean {
  const controller = runtime.events.get(npc.id);
  const pending = controller?.pending;
  if (!controller || !pending) return false;
  const choice = chooseEventChoice(npc, pending.choices);
  if (!choice) return false;
  const result = controller.resolve(asteroid, choice.id, (fraction) => {
    const damage = Math.max(0, Math.round(npc.hullMaxHp * fraction));
    npc.hullHp = Math.max(0, npc.hullHp - damage);
    return damage;
  });
  if (!result) return false;
  npc.lastWorkEvent = {
    kind: 'mining',
    title: result.title,
    choiceId: choice.id,
    risk: choice.risk,
    resultText: result.resultText,
  };
  npc.activityId = 'mining-event';
  npc.activity = `${result.title} · ${choice.riskLabel}`;
  if (result.aborted || npc.hullHp <= 0) {
    beginExit(runtime, ship);
    return true;
  }
  return false;
}

function syncCombatPose(
  runtime: MinerRuntime,
  npcId: string,
  position: WorldPoint,
  headingRadians: number,
  speed: number
): void {
  const ship = runtime.ships.find((entry) => entry.npcId === npcId);
  if (!ship) return;
  ship.position = {
    x: Math.max(0, Math.min(runtime.options.width, position.x)),
    y: Math.max(0, Math.min(runtime.options.height, position.y)),
  };
  ship.headingRadians = headingRadians;
  ship.speed = Math.max(0, speed);
  ship.phase = 'approaching';
  ship.targetAsteroidId = null;
  ship.laserActive = false;
  ship.scanProgress = 0;
}

function advanceApproaching(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState,
  dt: number
): void {
  if (ship.phase === 'approaching') {
    const asteroid = runtime.options
      .getAsteroids()
      .find((candidate) => candidate.id === ship.targetAsteroidId);
    if (!asteroid || !asteroid.deposits.some((deposit) => deposit.oreRemaining > 0)) {
      assignTarget(runtime, ship, npc);
      return;
    }
    const point = approachPoint(npc.id, asteroid);
    if (moveToward(ship, point, FLIGHT_SPEED, dt)) {
      ship.phase = 'scanning';
      ship.speed = 0;
      ship.scanProgress = 0;
      ship.headingRadians = Math.atan2(
        asteroid.position.y - ship.position.y,
        asteroid.position.x - ship.position.x
      );
    }
    return;
  }
}

function advanceScanning(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState,
  dt: number
): void {
  if (ship.phase === 'scanning') {
    const asteroid = runtime.options
      .getAsteroids()
      .find((candidate) => candidate.id === ship.targetAsteroidId);
    if (!asteroid) {
      beginExit(runtime, ship);
      return;
    }
    ship.speed = 0;
    ship.laserActive = false;
    ship.scanProgress = Math.min(1, ship.scanProgress + dt / SCAN_SECONDS);
    if (ship.scanProgress < 1) return;
    runtime.events.get(npc.id)?.begin(asteroid);
    ship.phase = 'mining';
    ship.miningAccumulator = 0;
    ship.laserActive = true;
    npc.activityId = 'mining';
    npc.activity = 'Abbau nach Asteroidenscan';
    return;
  }
}

function advanceMining(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState,
  dt: number
): void {
  if (ship.phase === 'mining') {
    const asteroid = runtime.options
      .getAsteroids()
      .find((candidate) => candidate.id === ship.targetAsteroidId);
    if (!asteroid) {
      beginExit(runtime, ship);
      return;
    }
    const controller = runtime.events.get(npc.id);
    if (controller?.pauseExtraction(asteroid, dt)) {
      ship.laserActive = false;
      if (resolvePendingEvent(runtime, ship, npc, asteroid)) return;
      return;
    }
    ship.speed = 0;
    ship.laserActive = true;
    ship.headingRadians = Math.atan2(
      asteroid.position.y - ship.position.y,
      asteroid.position.x - ship.position.x
    );
    ship.miningAccumulator += dt;
    const cycle = controller?.cycleSeconds(MINING_CYCLE_SECONDS) ?? MINING_CYCLE_SECONDS;
    while (ship.miningAccumulator >= cycle && ship.phase === 'mining') {
      ship.miningAccumulator -= cycle;
      mine(runtime, ship, npc, asteroid);
    }
    return;
  }
}

function advanceMiner(
  runtime: MinerRuntime,
  ship: LocalNpcMinerState,
  npc: SectorNpcState,
  dt: number
): boolean {
  if (ship.phase === 'entering' && !assignTarget(runtime, ship, npc)) return false;
  if (ship.phase === 'approaching') {
    advanceApproaching(runtime, ship, npc, dt);
    return false;
  }
  if (ship.phase === 'scanning') {
    advanceScanning(runtime, ship, npc, dt);
    return false;
  }
  if (ship.phase === 'mining') {
    advanceMining(runtime, ship, npc, dt);
    return false;
  }
  ship.laserActive = false;
  if (moveToward(ship, ship.exitPoint, FLIGHT_SPEED * 1.15, dt)) {
    runtime.options.depart(npc);
    return true;
  }
  return false;
}

function resolveMinerCollisions(runtime: MinerRuntime): void {
  const playerState = runtime.options.getPlayerShipState?.();
  const bodies: LocalShieldShipBody[] = runtime.ships.flatMap((local) => {
    const definition = getShipDefinition(local.shipId);
    return definition
      ? [{ id: local.npcId, ship: definition, state: local, pushWeight: 1 }]
      : [];
  });
  if (playerState && runtime.options.playerShip) {
    bodies.unshift({
      id: 'player',
      ship: runtime.options.playerShip,
      state: playerState,
      pushWeight: 2.4,
    });
  }
  resolveShipShieldCollisions(bodies);
  resolveShipShieldObstacleCollisions(
    bodies.filter((body) => body.id !== 'player'),
    runtime.options.getAsteroids().map((asteroid) => ({
      id: asteroid.id,
      position: asteroid.position,
      radius: asteroid.radius,
    }))
  );
}

function tickMinerRuntime(runtime: MinerRuntime, deltaSeconds: number): void {
  const dt = Math.min(Math.max(0, deltaSeconds), 0.08);
  if (dt <= 0) return;
  syncArrivals(runtime);
  for (let index = runtime.ships.length - 1; index >= 0; index -= 1) {
    const ship = runtime.ships[index]!;
    const npc = runtime.byId.get(ship.npcId);
    if (
      !npc ||
      npc.hullHp <= 0 ||
      (npc.combatRecoverySeconds ?? 0) > 0 ||
      npc.locationId !== runtime.options.locationId
    ) {
      runtime.ships.splice(index, 1);
      continue;
    }
    if (advanceMiner(runtime, ship, npc, dt)) runtime.ships.splice(index, 1);
  }
  resolveMinerCollisions(runtime);
}

export function createNpcLocalMiningService(options: NpcLocalMiningOptions): NpcLocalMiningService {
  const runtime: MinerRuntime = {
    options,
    ships: [],
    byId: new Map(options.miners.map((npc) => [npc.id, npc] as const)),
    events: new Map(
      options.miners.map((npc) => [
        npc.id,
        createMiningEventController(hashId(options.locationId + ':' + npc.id)),
      ])
    ),
  };
  syncArrivals(runtime);
  return {
    ships: runtime.ships,
    syncCombatPose: (id, position, heading, speed) =>
      syncCombatPose(runtime, id, position, heading, speed),
    tick: (dt) => tickMinerRuntime(runtime, dt),
  };
}
