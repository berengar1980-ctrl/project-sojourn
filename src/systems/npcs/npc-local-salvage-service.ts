import {
  advanceWorkerScan,
  workerCargoFull,
  workerCombatSuspended,
  workerMustExit,
  workerStepSeconds,
} from './npc-worker-primitives';
import type {
  LocalNpcSalvagerState,
  NpcLocalSalvageService,
  NpcLocalSalvageOptions,
} from './npc-local-salvage-types';
import type { ManeuveringShipControls } from '../../core/physical-ship-state';
export type {
  LocalNpcSalvagePhase,
  LocalNpcSalvagerState,
  NpcLocalSalvageService,
  NpcLocalSalvageOptions,
} from './npc-local-salvage-types';
import { salvageStockId } from '../salvage/salvage-stock-id';
import { salvageDroneObstacleAsteroids } from '../salvage/salvage-patrol-geometry';
import { moveFieldShip } from '../navigation/field-ship-routing';
import { workerGateAvailable } from './npc-local-field-arrivals';
import { seededLocalGate } from '../../core/local-space-exit';
import type { SectorNpcState } from '../../core/npc-types';
import type { SalvageWreck } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { createSalvageEventController } from '../salvage/salvage-event-service';
import { createSalvageFieldService } from '../salvage/salvage-field-service';
import { ensurePhysicalShipVelocity } from '../../core/physical-ship-state';
import {
  createLocalNpcPhysicalPose,
  localNpcCruiseSpeed,
  syncLocalNpcWorkerPose,
} from './npc-local-physical-pose';
import { resolveNpcSalvageLocalContacts } from './npc-local-salvage-contacts';
import { getShipDefinition, resolveShipRuntimeSetup } from '../ships';
import { ensureNpcInstalledComponents } from './npc-upgrade-service';
import {
  FLIGHT_SPEED,
  BASE_CYCLE_SECONDS,
  hashId,
  cargoUsed,
  eligible,
  wreckRemaining,
  chooseWreck,
  workPoint,
  chooseEventChoice,
  recoveryAmount,
} from './npc-local-salvage-helpers';

class LocalSalvageService implements NpcLocalSalvageService {
  readonly ships: LocalNpcSalvagerState[] = [];
  private readonly byId: Map<string, SectorNpcState>;
  private readonly events: Map<string, ReturnType<typeof createSalvageEventController>>;
  constructor(private readonly options: NpcLocalSalvageOptions) {
    this.byId = new Map(options.salvagers.map((npc) => [npc.id, npc]));
    this.events = new Map(
      options.salvagers.map((npc) => [
        npc.id,
        createSalvageEventController(hashId(options.locationId + ':' + npc.id)),
      ])
    );
    for (const saved of options.initialWorkers ?? []) {
      const npc = this.byId.get(saved.npcId);
      if (!npc || !eligible(npc, options.locationId) || npc.shipId !== saved.shipId) continue;
      const ship = structuredClone(saved);
      ensurePhysicalShipVelocity(ship);
      if (
        ship.targetWreckId &&
        !options.field.wrecks.some((wreck) => wreck.id === ship.targetWreckId)
      ) {
        ship.phase = 'approaching';
        ship.targetWreckId = null;
        ship.salvageActive = false;
        delete ship.routeState;
      }
      this.ships.push(ship);
    }
    this.syncArrivals();
  }
  private beginExit = (ship: LocalNpcSalvagerState): void => {
    ship.phase = 'exiting';
    delete ship.routeState;
    ship.targetWreckId = null;
    ship.salvageActive = false;
    ship.scanProgress = 0;
    ship.exitPoint = seededLocalGate(
      this.options.field.width,
      this.options.field.height,
      this.options.field.seed
    );
  };
  private syncArrivals = (): void => {
    const { initialPosition, getTrafficObstacles } = this.options;
    const active = new Set(this.ships.map((ship) => ship.npcId));
    for (const npc of this.options.salvagers) {
      if (this.byId.get(npc.id) !== npc) {
        this.byId.set(npc.id, npc);
        this.events.set(
          npc.id,
          createSalvageEventController(hashId(this.options.locationId + ':' + npc.id))
        );
      }
      if (active.has(npc.id) || !eligible(npc, this.options.locationId)) continue;
      const entry = seededLocalGate(
        this.options.field.width,
        this.options.field.height,
        this.options.field.seed
      );
      const explicit = initialPosition?.(npc.id);
      if (
        !explicit &&
        !workerGateAvailable(npc.id, npc.shipId, entry, this.ships, getTrafficObstacles)
      )
        continue;
      const speed = explicit || !getTrafficObstacles ? localNpcCruiseSpeed(npc, FLIGHT_SPEED) : 0;
      const worker: LocalNpcSalvagerState = {
        npcId: npc.id,
        name: npc.name,
        shipId: npc.shipId,
        ...createLocalNpcPhysicalPose(explicit ?? entry, 0, speed),
        phase: workerCargoFull(npc) ? 'exiting' : 'entering',
        targetWreckId: null,
        salvageActive: false,
        scanProgress: 0,
        workAccumulator: 0,
        exitPoint: { ...entry },
      };
      ensurePhysicalShipVelocity(worker);
      this.ships.push(worker);
    }
  };
  private assignTarget = (ship: LocalNpcSalvagerState, npc: SectorNpcState): boolean => {
    const occupied = new Set(
      this.ships
        .filter((candidate) => candidate.npcId !== ship.npcId && candidate.targetWreckId)
        .map((candidate) => candidate.targetWreckId as string)
    );
    for (const wreck of this.options.field.wrecks) {
      if (this.options.canWorkWreck && !this.options.canWorkWreck(npc, wreck)) {
        occupied.add(wreck.id);
      }
    }
    const wreck = chooseWreck(npc, this.options.field, occupied);
    if (!wreck) {
      this.beginExit(ship);
      return false;
    }
    ship.targetWreckId = wreck.id;
    delete ship.routeState;
    ship.phase = 'approaching';
    ship.salvageActive = false;
    ship.scanProgress = 0;
    return true;
  };
  private resolveEvent = (
    ship: LocalNpcSalvagerState,
    npc: SectorNpcState,
    wreck: SalvageWreck
  ): void => {
    const controller = this.events.get(npc.id);
    const pending = controller?.inspect(wreck);
    if (!controller || !pending) return;
    const choice = chooseEventChoice(npc, pending.choices);
    if (!choice) return;
    const resolved = controller.resolve(wreck, choice.id);
    if (!resolved) return;
    const result = this.options.onWreckEventResolved?.(wreck, resolved) ?? resolved;
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
  };
  private recoverComponent = (npc: SectorNpcState, wreck: SalvageWreck): boolean => {
    const component = wreck.component;
    if (!component || wreck.componentStatus !== 'available') return false;
    const stored = npc.salvageComponents ?? [];
    const cargo = stored.reduce(
      (sum, entry) => sum + 8 + 4 * Number(entry.componentId.match(/\\d+/)?.[0] ?? 1),
      0
    );
    if (cargoUsed(npc) + cargo + component.cargoTons > npc.cargoCapacity) return false;
    const ship = getShipDefinition(npc.shipId);
    if (!ship) return false;
    const salvage = createSalvageFieldService({
      field: this.options.field,
      setup: resolveShipRuntimeSetup(ship, { installed: ensureNpcInstalledComponents(npc) })
        .salvage,
      crewSkill: Math.min(90, 32 + npc.successfulRuns * 2),
      collect: () => 0,
      collectComponent: () => {
        stored.push({ type: component.type, componentId: component.componentId });
        npc.salvageComponents = stored;
        return true;
      },
    });
    salvage.inspectWreck(wreck.id);
    const result = salvage.recoverComponent(wreck.id);
    if (result?.outcome !== 'recovered') return false;
    npc.activityId = 'salvage-component';
    npc.activity = 'Schiffskomponente geborgen';
    return true;
  };
  private recover = (
    ship: LocalNpcSalvagerState,
    npc: SectorNpcState,
    wreck: SalvageWreck
  ): void => {
    const deposit = [...wreck.resources]
      .filter((entry) => entry.remainingAmount > 0)
      .sort((a, b) => b.remainingAmount - a.remainingAmount)[0];
    if (!deposit) {
      if (!this.recoverComponent(npc, wreck) && wreck.componentStatus === 'available') {
        this.beginExit(ship);
      } else {
        this.assignTarget(ship, npc);
      }
      return;
    }
    const requested = Math.min(recoveryAmount(npc, wreck), deposit.remainingAmount);
    const accepted = this.options.recover(
      npc,
      deposit.resourceId,
      requested,
      salvageStockId(this.options.field, wreck)
    );
    if (accepted > 0) deposit.remainingAmount = Math.max(0, deposit.remainingAmount - accepted);

    if (workerMustExit(npc, accepted)) {
      this.beginExit(ship);
    } else if (wreckRemaining(wreck) <= 0) {
      this.recoverComponent(npc, wreck);
      this.assignTarget(ship, npc);
    }
  };
  syncCombatPose = (
    npcId: string,
    position: WorldPoint,
    headingRadians: number,
    velocity: WorldPoint,
    maneuvering?: Partial<ManeuveringShipControls>
  ): void =>
    syncLocalNpcWorkerPose(
      this.ships,
      npcId,
      position,
      headingRadians,
      velocity,
      maneuvering,
      (ship) =>
        Object.assign(ship, {
          phase: 'approaching',
          targetWreckId: null,
          salvageActive: false,
          scanProgress: 0,
        }),
      this.options.field
    );
  private advanceApproaching = (
    ship: LocalNpcSalvagerState,
    npc: SectorNpcState,
    dt: number
  ): void => {
    const wreck = this.options.field.wrecks.find((entry) => entry.id === ship.targetWreckId);
    if (!wreck || (wreckRemaining(wreck) <= 0 && wreck.componentStatus !== 'available')) {
      this.assignTarget(ship, npc);
      return;
    }
    if (
      moveFieldShip(
        ship,
        workPoint(npc.id, wreck),
        localNpcCruiseSpeed(npc, FLIGHT_SPEED),
        dt,
        [
          ...salvageDroneObstacleAsteroids(this.options.field).filter(
            (entry) => entry.routeBlocking
          ),
          ...(this.options.getTrafficObstacles?.(npc.id) ?? []),
        ],
        65
      )
    ) {
      ship.phase = 'scanning';
      ship.velocity = { x: 0, y: 0 };
      ship.scanProgress = 0;
      ship.headingRadians = Math.atan2(
        wreck.position.y - ship.position.y,
        wreck.position.x - ship.position.x
      );
    }
    return;
  };
  private advanceScanning = (
    ship: LocalNpcSalvagerState,
    npc: SectorNpcState,
    dt: number
  ): void => {
    const wreck = this.options.field.wrecks.find((entry) => entry.id === ship.targetWreckId);
    if (!wreck) {
      this.beginExit(ship);
      return;
    }
    if (!advanceWorkerScan(ship, dt)) return;
    wreck.inspected = true;
    wreck.scanLevel = 'analyzed';
    if (this.options.registerWreck && !this.options.registerWreck(npc, wreck)) {
      this.assignTarget(ship, npc);
      return;
    }
    this.resolveEvent(ship, npc, wreck);
    ship.phase = 'salvaging';
    ship.salvageActive = true;
    npc.activityId = 'salvage';
    npc.activity = 'Bergung nach Wrackscan';
    return;
  };
  private advanceSalvaging = (
    ship: LocalNpcSalvagerState,
    npc: SectorNpcState,
    dt: number
  ): void => {
    const wreck = this.options.field.wrecks.find((entry) => entry.id === ship.targetWreckId);
    if (!wreck) {
      this.beginExit(ship);
      return;
    }
    ship.velocity = { x: 0, y: 0 };
    ship.salvageActive = true;
    ship.headingRadians = Math.atan2(
      wreck.position.y - ship.position.y,
      wreck.position.x - ship.position.x
    );
    ship.workAccumulator += dt;
    if (ship.workAccumulator < 0) return;
    while (ship.workAccumulator >= BASE_CYCLE_SECONDS && ship.phase === 'salvaging') {
      ship.workAccumulator -= BASE_CYCLE_SECONDS;
      this.recover(ship, npc, wreck);
    }
    return;
  };
  tick = (deltaSeconds: number, combatantId?: string, skipPlayer = false): void => {
    const dt = workerStepSeconds(deltaSeconds);
    if (dt <= 0) return;
    this.syncArrivals();

    for (let index = this.ships.length - 1; index >= 0; index -= 1) {
      const ship = this.ships[index]!;
      const npc = this.byId.get(ship.npcId);
      // Keep the combatant under duel authority; do not remove or move it.
      if (ship.npcId === combatantId) continue;
      if (
        !npc ||
        npc.hullHp <= 0 ||
        npc.retiredUntilDay !== undefined ||
        npc.travel ||
        npc.locationId !== this.options.locationId
      ) {
        this.ships.splice(index, 1);
        continue;
      }

      // The native PvP combat actor owns this ship while engaged. Suspend
      // work without moving the salvager or losing its field identity.
      if (workerCombatSuspended(npc)) {
        // The duel pose was mirrored before this tick; preserve its velocity.
        ship.salvageActive = false;
        ship.targetWreckId = null;
        ship.phase = 'approaching';
        delete ship.routeState;
        continue;
      }

      if (npc.workLocationId !== this.options.locationId || npc.autonomy?.phase !== 'working') {
        this.ships.splice(index, 1);
        continue;
      }
      if (workerCargoFull(npc) && ship.phase !== 'exiting') this.beginExit(ship);

      if (this.advanceWorker(ship, npc, dt)) this.ships.splice(index, 1);
    }

    if (this.options.resolveLocalCollisions !== false)
      this.resolveLocalCollisions(combatantId, skipPlayer);
  };
  private advanceWorker(ship: LocalNpcSalvagerState, npc: SectorNpcState, dt: number): boolean {
    if (ship.phase === 'entering') {
      if (!this.assignTarget(ship, npc)) return false;
    }

    if (ship.phase === 'approaching') {
      this.advanceApproaching(ship, npc, dt);
      return false;
    }

    if (ship.phase === 'scanning') {
      this.advanceScanning(ship, npc, dt);
      return false;
    }

    if (ship.phase === 'salvaging') {
      this.advanceSalvaging(ship, npc, dt);
      return false;
    }

    ship.salvageActive = false;
    if (
      moveFieldShip(
        ship,
        ship.exitPoint,
        localNpcCruiseSpeed(npc, FLIGHT_SPEED),
        dt,
        [
          ...salvageDroneObstacleAsteroids(this.options.field).filter(
            (entry) => entry.routeBlocking
          ),
          ...(this.options.getTrafficObstacles?.(npc.id) ?? []),
        ],
        65
      )
    ) {
      this.options.depart(npc);
      return true;
    }
    return false;
  }
  private resolveLocalCollisions = (combatantId?: string, skipPlayer = false): void =>
    resolveNpcSalvageLocalContacts(this.options, this.ships, this.byId, combatantId, skipPlayer);
}

export function createNpcLocalSalvageService(
  options: NpcLocalSalvageOptions
): NpcLocalSalvageService {
  return new LocalSalvageService(options);
}
