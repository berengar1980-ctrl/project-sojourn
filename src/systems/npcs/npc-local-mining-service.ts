import { planMiningApproachRoute } from '../local-space/local-space-navigation';
import { moveFieldShip } from '../navigation/field-ship-routing';
import { seededLocalGate } from '../../core/local-space-exit';
import { cloneCareerJson } from '../persistence/career-save-contract';
import { stageLocalMinerCheckpoint } from './npc-local-mining-checkpoint';
import type { LocalAsteroid } from '../../core/local-space-types';

import type { SectorNpcState } from '../../core/npc-types';

import type { WorldPoint } from '../../core/world-types';

import { createMiningEventController } from '../local-space/mining-event-service';

import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';

import { getShipDefinition, resolveShipLocalCruiseSpeed } from '../ships';
import { ensureNpcInstalledComponents } from './npc-upgrade-service';

import {
  type NpcLocalMiningOptions,
  type LocalMinerCheckpoint,
  type LocalNpcMinerState,
  eligibleMiner,
  FLIGHT_SPEED,
  chooseAsteroid,
  MINING_AMOUNT,
  cargoUsed,
  chooseEventChoice,
  approachPoint,
  SCAN_SECONDS,
  MINING_CYCLE_SECONDS,
  type NpcLocalMiningService,
  hashId,
} from './npc-mining-targets';

export type { LocalNpcMiningPhase } from './npc-mining-targets';

export type { LocalNpcMinerState } from './npc-mining-targets';

export type { NpcLocalMiningService } from './npc-mining-targets';

export type { NpcLocalMiningOptions } from './npc-mining-targets';

function localCruiseSpeed(npc: SectorNpcState): number {
  const ship = getShipDefinition(npc.shipId);
  return ship ? resolveShipLocalCruiseSpeed(ship, ensureNpcInstalledComponents(npc)) : FLIGHT_SPEED;
}

interface MinerRuntime {
  readonly options: NpcLocalMiningOptions;
  readonly ships: LocalNpcMinerState[];
  readonly byId: Map<string, SectorNpcState>;
  readonly events: Map<string, ReturnType<typeof createMiningEventController>>;
  readonly combatReturnPositions: Map<string, WorldPoint>;
}

function beginExit(runtime: MinerRuntime, ship: LocalNpcMinerState): void {
  ship.phase = 'exiting';
  ship.targetAsteroidId = null;
  ship.laserActive = false;
  ship.scanProgress = 0;
  ship.exitPoint = seededLocalGate(
    runtime.options.width,
    runtime.options.height,
    runtime.options.seed ?? 0
  );
}

function syncArrivals(runtime: MinerRuntime): void {
  const active = new Set(runtime.ships.map((ship) => ship.npcId));
  for (const npc of runtime.options.miners) {
    if (active.has(npc.id) || !eligibleMiner(npc, runtime.options.locationId)) continue;
    const entry = seededLocalGate(
      runtime.options.width,
      runtime.options.height,
      runtime.options.seed ?? 0
    );
    const resumePosition = runtime.combatReturnPositions.get(npc.id);
    runtime.ships.push({
      npcId: npc.id,
      name: npc.name,
      shipId: npc.shipId,
      position: resumePosition ? { ...resumePosition } : { ...entry },
      headingRadians: 0,
      speed: localCruiseSpeed(npc),
      phase: 'entering',
      targetAsteroidId: null,
      laserActive: false,
      scanProgress: 0,
      entryPoint: entry,
      exitPoint: { ...entry },
      miningAccumulator: 0,
    });
    runtime.combatReturnPositions.delete(npc.id);
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
  ship.phase = 'approaching';
  ship.laserActive = false;
  ship.scanProgress = 0;
  // Pick an actually reachable approach position, not an arbitrary fixed angle
  // that can be trapped behind solid asteroids.
  const route = planMiningApproachRoute({
    start: ship.position,
    target: asteroid,
    asteroids: runtime.options.getAsteroids(),
    clearance: 65,
    width: runtime.options.width,
    height: runtime.options.height,
  });
  const endpoint = route[route.length - 1] ?? approachPoint(npc.id, asteroid);
  ship.routeState = {
    target: { ...endpoint },
    points: route.slice(1).map((point) => ({ ...point })),
    index: 0,
  };
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
  if (accepted > 0) {
    // A real successful mining cycle spawns one collecting ore fragment.
    // The existing player chunk/tractor visualizer renders its travel.
    ship.oreCollection = {
      resourceId: deposit.resourceId,
      remainingSeconds: MINING_CYCLE_SECONDS,
      durationSeconds: MINING_CYCLE_SECONDS,
    };
    deposit.oreRemaining = Math.max(0, deposit.oreRemaining - accepted);
    runtime.options.onAsteroidMined?.(npc, asteroid, deposit.resourceId, accepted);
  }
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
    const point = ship.routeState?.target ?? approachPoint(npc.id, asteroid);
    const validBlocker = (rock: LocalAsteroid) => rock.routeBlocking && rock.id !== asteroid.id;
    const rockBlockers = runtime.options.getAsteroids().filter(validBlocker);
    if (
      moveFieldShip(
        ship,
        point,
        localCruiseSpeed(npc),
        dt,
        [...rockBlockers, ...(runtime.options.getTrafficObstacles?.(npc.id) ?? [])],
        65
      )
    ) {
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
    runtime.options.onAsteroidScanned?.(npc, asteroid);
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
  if (
    moveFieldShip(
      ship,
      ship.exitPoint,
      localCruiseSpeed(npc),
      dt,
      [
        ...runtime.options.getAsteroids().filter((rock) => rock.routeBlocking),
        ...(runtime.options.getTrafficObstacles?.(npc.id) ?? []),
      ],
      65
    )
  ) {
    runtime.options.depart(npc);
    return true;
  }
  return false;
}

function resolveMinerCollisions(runtime: MinerRuntime, combatantId?: string): void {
  const playerState = runtime.options.getPlayerShipState?.();
  const bodies: LocalShieldShipBody[] = runtime.ships.flatMap((local) => {
    const npc = runtime.byId.get(local.npcId);
    // Duel motion is owned by the PvP engine, but the ship still has a solid
    // shield body in the mining field. Include it for player contact response.
    if (local.npcId === combatantId || (npc?.hullHp ?? 0) <= 0) return [];
    const definition = getShipDefinition(local.shipId);
    return definition ? [{ id: local.npcId, ship: definition, state: local, pushWeight: 1 }] : [];
  });
  const playerShip = runtime.options.getPlayerShip?.() ?? runtime.options.playerShip;
  if (playerState && playerShip) {
    bodies.unshift({
      id: 'player',
      ship: playerShip,
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

function tickMinerRuntime(runtime: MinerRuntime, deltaSeconds: number, combatantId?: string): void {
  const dt = Math.min(Math.max(0, deltaSeconds), 0.08);
  if (dt <= 0) return;
  syncArrivals(runtime);
  for (let index = runtime.ships.length - 1; index >= 0; index -= 1) {
    const ship = runtime.ships[index]!;
    if (ship.oreCollection) {
      ship.oreCollection.remainingSeconds = Math.max(0, ship.oreCollection.remainingSeconds - dt);
      if (ship.oreCollection.remainingSeconds <= 0) delete ship.oreCollection;
    }
    const npc = runtime.byId.get(ship.npcId);
    // The duel owns this NPC's movement until its final pose is reconciled.
    if (ship.npcId === combatantId) continue;
    if (!npc || npc.hullHp <= 0 || npc.locationId !== runtime.options.locationId) {
      runtime.combatReturnPositions.delete(ship.npcId);
      runtime.ships.splice(index, 1);
      continue;
    }
    // NPC-versus-NPC battles and their recovery never despawn a miner from
    // its local field. Suspend work until the same physical ship may resume.
    if (npc.combatMovement || (npc.combatRecoverySeconds ?? 0) > 0) {
      ship.speed = 0;
      ship.laserActive = false;
      delete ship.oreCollection;
      ship.scanProgress = 0;
      ship.targetAsteroidId = null;
      ship.phase = 'approaching';
      delete ship.routeState;
      continue;
    }
    if (advanceMiner(runtime, ship, npc, dt)) runtime.ships.splice(index, 1);
  }
  if (runtime.options.resolveLocalCollisions !== false)
    resolveMinerCollisions(runtime, combatantId);
}

export function createNpcLocalMiningService(
  options: NpcLocalMiningOptions,
  checkpoint?: LocalMinerCheckpoint
): NpcLocalMiningService {
  const runtime: MinerRuntime = {
    options,
    ships: [],
    combatReturnPositions: new Map(),
    byId: new Map(options.miners.map((npc) => [npc.id, npc] as const)),
    events: new Map(
      options.miners.map((npc) => [
        npc.id,
        createMiningEventController(hashId(options.locationId + ':' + npc.id)),
      ])
    ),
  };
  if (checkpoint) {
    const saved = stageLocalMinerCheckpoint(checkpoint, options);
    runtime.ships.push(...saved.ships.map((ship) => cloneCareerJson(ship)));
    for (const [id, point] of saved.combatReturns) {
      runtime.combatReturnPositions.set(id, { ...point });
    }
    for (const [id, event] of saved.events) runtime.events.get(id)!.restoreState(event);
  } else {
    syncArrivals(runtime);
  }
  return {
    exportState: () => ({
      version: 1,
      locationId: options.locationId,
      seed: options.seed ?? 0,
      width: options.width,
      height: options.height,
      ships: runtime.ships.map((ship) => cloneCareerJson(ship)),
      combatReturns: [...runtime.combatReturnPositions].map(
        ([id, position]) => [id, { ...position }] as const
      ),
      events: [...runtime.events].map(([id, event]) => [id, event.exportState()] as const),
    }),
    ships: runtime.ships,
    syncCombatPose: (id, position, heading, speed) =>
      syncCombatPose(runtime, id, position, heading, speed),
    tick: (dt, combatantId) => tickMinerRuntime(runtime, dt, combatantId),
  };
}
