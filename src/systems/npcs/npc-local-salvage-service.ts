import type { LocalShipState } from '../../core/local-space-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { SalvageEventChoice, SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { createSalvageEventController } from '../salvage/salvage-event-service';
import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';
import { getShipDefinition, resolveShipRuntimeSetup, stationFactor } from '../ships';

export type LocalNpcSalvagePhase =
  'entering' | 'approaching' | 'scanning' | 'salvaging' | 'exiting';

export interface LocalNpcSalvagerState {
  readonly npcId: string;
  readonly name: string;
  readonly shipId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  phase: LocalNpcSalvagePhase;
  targetWreckId: string | null;
  salvageActive: boolean;
  scanProgress: number;
  workAccumulator: number;
  exitPoint: WorldPoint;
}

export interface NpcLocalSalvageService {
  readonly ships: readonly LocalNpcSalvagerState[];
  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number, speed: number): void;
  tick(deltaSeconds: number): void;
}

export interface NpcLocalSalvageOptions {
  readonly locationId: string;
  readonly field: SalvageField;
  readonly salvagers: readonly SectorNpcState[];
  readonly recover: (npc: SectorNpcState, resourceId: string, requested: number) => number;
  readonly depart: (npc: SectorNpcState) => boolean;
  readonly playerShip?: ShipDefinition;
  readonly getPlayerShipState?: () => LocalShipState;
}

const ENTRY_MARGIN = 18;
const EXIT_MARGIN = 90;
const APPROACH_DISTANCE = 120;
const FLIGHT_SPEED = 82;
const SCAN_SECONDS = 5;
const BASE_CYCLE_SECONDS = 1.4;

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
  const t = ((hash >>> 4) % 1000) / 1000;
  const margin = outside ? EXIT_MARGIN : ENTRY_MARGIN;
  if (side === 0) return { x: outside ? -margin : margin, y: height * (0.15 + t * 0.7) };
  if (side === 1) return { x: width - (outside ? -margin : margin), y: height * (0.15 + t * 0.7) };
  if (side === 2) return { x: width * (0.15 + t * 0.7), y: outside ? -margin : margin };
  return { x: width * (0.15 + t * 0.7), y: height - (outside ? -margin : margin) };
}

function moveToward(
  ship: LocalNpcSalvagerState,
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

function eligible(npc: SectorNpcState, locationId: string): boolean {
  return (
    npc.job === 'salvager' &&
    npc.workLocationId === locationId &&
    npc.locationId === locationId &&
    !npc.travel &&
    npc.autonomy?.phase === 'working' &&
    cargoUsed(npc) < Math.max(1, Math.floor(npc.cargoCapacity))
  );
}

function wreckRemaining(wreck: SalvageWreck): number {
  return wreck.resources.reduce((sum, entry) => sum + Math.max(0, entry.remainingAmount), 0);
}

function chooseWreck(
  npc: SectorNpcState,
  field: SalvageField,
  occupied: ReadonlySet<string>
): SalvageWreck | null {
  const candidates = field.wrecks.filter(
    (wreck) => !occupied.has(wreck.id) && wreckRemaining(wreck) > 0
  );
  if (candidates.length === 0) return null;
  return (
    [...candidates].sort(
      (a, b) =>
        b.quality - a.quality || wreckRemaining(b) - wreckRemaining(a) || a.id.localeCompare(b.id)
    )[hashId(npc.id) % Math.min(4, candidates.length)] ??
    candidates[0] ??
    null
  );
}

function workPoint(npcId: string, wreck: SalvageWreck): WorldPoint {
  const angle = ((hashId(npcId + ':' + wreck.id) % 6283) / 1000) % (Math.PI * 2);
  const range = wreck.radius + APPROACH_DISTANCE;
  return {
    x: wreck.position.x + Math.cos(angle) * range,
    y: wreck.position.y + Math.sin(angle) * range,
  };
}

function chooseEventChoice(
  npc: SectorNpcState,
  choices: readonly SalvageEventChoice[]
): SalvageEventChoice | null {
  if (choices.length === 0) return null;
  const rank = { safe: 0, controlled: 1, risky: 2, high_risk: 3 } as const;
  const risky = npc.workRiskPreference === 'risky';
  return (
    [...choices].sort((a, b) =>
      risky ? rank[b.risk] - rank[a.risk] : rank[a.risk] - rank[b.risk]
    )[0] ?? null
  );
}

function recoveryAmount(npc: SectorNpcState, wreck: SalvageWreck): number {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return 3 + wreck.quality * 2;
  const runtime = resolveShipRuntimeSetup(ship);
  const crewMultiplier = stationFactor(20, 0.35);
  return Math.max(
    1,
    Math.round((3 + wreck.quality * 2) * runtime.salvage.yieldMultiplier * crewMultiplier)
  );
}

export function createNpcLocalSalvageService(
  options: NpcLocalSalvageOptions
): NpcLocalSalvageService {
  const ships: LocalNpcSalvagerState[] = [];
  const byId = new Map(options.salvagers.map((npc) => [npc.id, npc] as const));
  const events = new Map(
    options.salvagers.map((npc) => [
      npc.id,
      createSalvageEventController(hashId(options.locationId + ':' + npc.id)),
    ])
  );

  function beginExit(ship: LocalNpcSalvagerState): void {
    ship.phase = 'exiting';
    ship.targetWreckId = null;
    ship.salvageActive = false;
    ship.scanProgress = 0;
    ship.exitPoint = edgePoint(
      ship.npcId + ':exit',
      options.field.width,
      options.field.height,
      true
    );
  }

  function syncArrivals(): void {
    const active = new Set(ships.map((ship) => ship.npcId));
    for (const npc of options.salvagers) {
      if (active.has(npc.id) || !eligible(npc, options.locationId)) continue;
      const entry = edgePoint(npc.id, options.field.width, options.field.height);
      ships.push({
        npcId: npc.id,
        name: npc.name,
        shipId: npc.shipId,
        position: { ...entry },
        headingRadians: 0,
        speed: FLIGHT_SPEED,
        phase: 'entering',
        targetWreckId: null,
        salvageActive: false,
        scanProgress: 0,
        workAccumulator: 0,
        exitPoint: edgePoint(npc.id + ':exit', options.field.width, options.field.height, true),
      });
    }
  }

  function assignTarget(ship: LocalNpcSalvagerState, npc: SectorNpcState): boolean {
    const occupied = new Set(
      ships
        .filter((candidate) => candidate.npcId !== ship.npcId && candidate.targetWreckId)
        .map((candidate) => candidate.targetWreckId as string)
    );
    const wreck = chooseWreck(npc, options.field, occupied);
    if (!wreck) {
      beginExit(ship);
      return false;
    }
    ship.targetWreckId = wreck.id;
    ship.phase = 'entering';
    ship.salvageActive = false;
    ship.scanProgress = 0;
    return true;
  }

  function resolveEvent(
    ship: LocalNpcSalvagerState,
    npc: SectorNpcState,
    wreck: SalvageWreck
  ): void {
    const controller = events.get(npc.id);
    const pending = controller?.inspect(wreck);
    if (!controller || !pending) return;
    const choice = chooseEventChoice(npc, pending.choices);
    if (!choice) return;
    const result = controller.resolve(wreck, choice.id);
    if (!result) return;
    npc.lastWorkEvent = {
      kind: 'salvage',
      title: result.title,
      choiceId: choice.id,
      risk: choice.risk,
      resultText: result.resultText,
    };
    npc.activityId = 'salvage-event';
    npc.activity = `${result.title} · ${choice.riskLabel}`;
    ship.workAccumulator = -controller.recoverySeconds;
  }

  function recover(ship: LocalNpcSalvagerState, npc: SectorNpcState, wreck: SalvageWreck): void {
    const deposit = [...wreck.resources]
      .filter((entry) => entry.remainingAmount > 0)
      .sort((a, b) => b.remainingAmount - a.remainingAmount)[0];
    if (!deposit) {
      assignTarget(ship, npc);
      return;
    }
    const requested = Math.min(recoveryAmount(npc, wreck), deposit.remainingAmount);
    const accepted = options.recover(npc, deposit.resourceId, requested);
    if (accepted > 0) deposit.remainingAmount = Math.max(0, deposit.remainingAmount - accepted);

    if (accepted <= 0 || cargoUsed(npc) >= Math.floor(npc.cargoCapacity)) {
      beginExit(ship);
    } else if (wreckRemaining(wreck) <= 0) {
      assignTarget(ship, npc);
    }
  }

  syncArrivals();

  function syncCombatPose(
    npcId: string,
    position: WorldPoint,
    headingRadians: number,
    speed: number
  ): void {
    const ship = ships.find((entry) => entry.npcId === npcId);
    if (!ship) return;
    ship.position = {
      x: Math.max(0, Math.min(options.field.width, position.x)),
      y: Math.max(0, Math.min(options.field.height, position.y)),
    };
    ship.headingRadians = headingRadians;
    ship.speed = Math.max(0, speed);
    ship.phase = 'approaching';
    ship.targetWreckId = null;
    ship.salvageActive = false;
    ship.scanProgress = 0;
  }

  return {
    ships,
    syncCombatPose,
    tick(deltaSeconds) {
      const dt = Math.min(Math.max(0, deltaSeconds), 0.08);
      if (dt <= 0) return;
      syncArrivals();

      for (let index = ships.length - 1; index >= 0; index -= 1) {
        const ship = ships[index]!;
        const npc = byId.get(ship.npcId);
        if (
          !npc ||
          npc.hullHp <= 0 ||
          (npc.combatRecoverySeconds ?? 0) > 0 ||
          npc.locationId !== options.locationId
        ) {
          ships.splice(index, 1);
          continue;
        }

        if (ship.phase === 'entering') {
          if (!assignTarget(ship, npc)) continue;
        }

        if (ship.phase === 'approaching') {
          const wreck = options.field.wrecks.find((entry) => entry.id === ship.targetWreckId);
          if (!wreck || wreckRemaining(wreck) <= 0) {
            assignTarget(ship, npc);
            continue;
          }
          if (moveToward(ship, workPoint(npc.id, wreck), FLIGHT_SPEED, dt)) {
            ship.phase = 'scanning';
            ship.speed = 0;
            ship.scanProgress = 0;
            ship.headingRadians = Math.atan2(
              wreck.position.y - ship.position.y,
              wreck.position.x - ship.position.x
            );
          }
          continue;
        }

        if (ship.phase === 'scanning') {
          const wreck = options.field.wrecks.find((entry) => entry.id === ship.targetWreckId);
          if (!wreck) {
            beginExit(ship);
            continue;
          }
          ship.speed = 0;
          ship.scanProgress = Math.min(1, ship.scanProgress + dt / SCAN_SECONDS);
          if (ship.scanProgress < 1) continue;
          resolveEvent(ship, npc, wreck);
          ship.phase = 'salvaging';
          ship.salvageActive = true;
          npc.activityId = 'salvage';
          npc.activity = 'Bergung nach Wrackscan';
          continue;
        }

        if (ship.phase === 'salvaging') {
          const wreck = options.field.wrecks.find((entry) => entry.id === ship.targetWreckId);
          if (!wreck) {
            beginExit(ship);
            continue;
          }
          ship.speed = 0;
          ship.salvageActive = true;
          ship.headingRadians = Math.atan2(
            wreck.position.y - ship.position.y,
            wreck.position.x - ship.position.x
          );
          ship.workAccumulator += dt;
          if (ship.workAccumulator < 0) continue;
          while (ship.workAccumulator >= BASE_CYCLE_SECONDS && ship.phase === 'salvaging') {
            ship.workAccumulator -= BASE_CYCLE_SECONDS;
            recover(ship, npc, wreck);
          }
          continue;
        }

        ship.salvageActive = false;
        if (moveToward(ship, ship.exitPoint, FLIGHT_SPEED * 1.15, dt)) {
          ships.splice(index, 1);
          options.depart(npc);
        }
      }

      const playerState = options.getPlayerShipState?.();
      const bodies: LocalShieldShipBody[] = ships.flatMap((local) => {
        const definition = getShipDefinition(local.shipId);
        return definition
          ? [{ id: local.npcId, ship: definition, state: local, pushWeight: 1 }]
          : [];
      });
      if (playerState && options.playerShip) {
        bodies.unshift({
          id: 'player',
          ship: options.playerShip,
          state: playerState,
          pushWeight: 2.4,
        });
      }
      resolveShipShieldCollisions(bodies);
      resolveShipShieldObstacleCollisions(
        bodies,
        options.field.wrecks.map((wreck) => ({
          id: wreck.id,
          position: wreck.position,
          radius: wreck.radius,
        }))
      );
    },
  };
}
