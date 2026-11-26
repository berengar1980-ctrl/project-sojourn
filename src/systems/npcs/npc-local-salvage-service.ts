import { salvageStockId } from '../salvage/salvage-stock-id';
import { salvageDroneObstacleAsteroids } from '../salvage/salvage-patrol-geometry';
import {
  moveFieldShip,
  type FieldRouteState,
  type FieldRouteObstacle,
} from '../navigation/field-ship-routing';
import { seededLocalGate } from '../../core/local-space-exit';
import { resolveSalvageShieldContacts } from '../salvage/salvage-container-motion';
import type { LocalShipState } from '../../core/local-space-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { createSalvageEventController } from '../salvage/salvage-event-service';
import { createSalvageFieldService } from '../salvage/salvage-field-service';
import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';
import { getShipDefinition, resolveShipLocalCruiseSpeed, resolveShipRuntimeSetup } from '../ships';
import { ensureNpcInstalledComponents } from './npc-upgrade-service';
import {
  FLIGHT_SPEED,
  SCAN_SECONDS,
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

export type LocalNpcSalvagePhase =
  'entering' | 'approaching' | 'scanning' | 'salvaging' | 'exiting';

export interface LocalNpcSalvagerState {
  readonly npcId: string;
  readonly name: string;
  readonly shipId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  routeState?: FieldRouteState;
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
  tick(deltaSeconds: number, combatantId?: string, skipPlayer?: boolean): void;
}

export interface NpcLocalSalvageOptions {
  readonly locationId: string;
  readonly field: SalvageField;
  readonly salvagers: readonly SectorNpcState[];
  readonly initialPosition?: (id: string) => WorldPoint | undefined;
  readonly initialWorkers?: readonly LocalNpcSalvagerState[];
  /** Disable internal contacts when the shared world solves all physical ships once. */
  readonly resolveLocalCollisions?: boolean;
  readonly getTrafficObstacles?: (npcId: string) => readonly FieldRouteObstacle[];
  readonly recover: (
    npc: SectorNpcState,
    resourceId: string,
    requested: number,
    sourceId?: string
  ) => number;
  readonly depart: (npc: SectorNpcState) => boolean;
  readonly canWorkWreck?: (npc: SectorNpcState, wreck: SalvageWreck) => boolean;
  readonly registerWreck?: (npc: SectorNpcState, wreck: SalvageWreck) => boolean;
  readonly playerShip?: ShipDefinition | undefined;
  readonly getPlayerShipState?: () => LocalShipState | undefined;
  readonly onPlayerShieldContact?: (normal: WorldPoint, overlap: number) => void;
}

function localCruiseSpeed(npc: SectorNpcState): number {
  const ship = getShipDefinition(npc.shipId);
  return ship ? resolveShipLocalCruiseSpeed(ship, ensureNpcInstalledComponents(npc)) : FLIGHT_SPEED;
}

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
      if (ship.targetWreckId && !options.field.wrecks.some((wreck) => wreck.id === ship.targetWreckId)) {
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
      this.ships.push({
        npcId: npc.id,
        name: npc.name,
        shipId: npc.shipId,
        position: { ...(this.options.initialPosition?.(npc.id) ?? entry) },
        headingRadians: 0,
        speed: localCruiseSpeed(npc),
        phase: cargoUsed(npc) >= Math.max(1, Math.floor(npc.cargoCapacity)) ? 'exiting' : 'entering',
        targetWreckId: null,
        salvageActive: false,
        scanProgress: 0,
        workAccumulator: 0,
        exitPoint: { ...entry },
      });
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

    if (accepted <= 0 || cargoUsed(npc) >= Math.floor(npc.cargoCapacity)) {
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
    speed: number
  ): void => {
    const ship = this.ships.find((entry) => entry.npcId === npcId);
    if (!ship) return;
    ship.position = {
      x: Math.max(0, Math.min(this.options.field.width, position.x)),
      y: Math.max(0, Math.min(this.options.field.height, position.y)),
    };
    ship.headingRadians = headingRadians;
    ship.speed = Math.max(0, speed);
    ship.phase = 'approaching';
    ship.targetWreckId = null;
    ship.salvageActive = false;
    ship.scanProgress = 0;
  };
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
        localCruiseSpeed(npc),
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
      ship.speed = 0;
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
    ship.speed = 0;
    ship.scanProgress = Math.min(1, ship.scanProgress + dt / SCAN_SECONDS);
    if (ship.scanProgress < 1) return;
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
    ship.speed = 0;
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
    const dt = Math.min(Math.max(0, deltaSeconds), 0.08);
    if (dt <= 0) return;
    this.syncArrivals();

    for (let index = this.ships.length - 1; index >= 0; index -= 1) {
      const ship = this.ships[index]!;
      const npc = this.byId.get(ship.npcId);
      // Keep the combatant under duel authority; do not remove or move it.
      if (ship.npcId === combatantId) continue;
      if (!npc || npc.hullHp <= 0 || npc.retiredUntilDay !== undefined || npc.travel || npc.locationId !== this.options.locationId) {
        this.ships.splice(index, 1);
        continue;
      }

      // The native PvP combat actor owns this ship while engaged. Suspend
      // work without moving the salvager or losing its field identity.
      if (npc.combatMovement || (npc.combatRecoverySeconds ?? 0) > 0) {
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
      if (cargoUsed(npc) >= Math.max(1, Math.floor(npc.cargoCapacity)) && ship.phase !== 'exiting')
        this.beginExit(ship);

      if (ship.phase === 'entering') {
        if (!this.assignTarget(ship, npc)) continue;
      }

      if (ship.phase === 'approaching') {
        this.advanceApproaching(ship, npc, dt);
        continue;
      }

      if (ship.phase === 'scanning') {
        this.advanceScanning(ship, npc, dt);
        continue;
      }

      if (ship.phase === 'salvaging') {
        this.advanceSalvaging(ship, npc, dt);
        continue;
      }

      ship.salvageActive = false;
      if (
        moveFieldShip(
          ship,
          ship.exitPoint,
          localCruiseSpeed(npc),
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
        this.ships.splice(index, 1);
        this.options.depart(npc);
      }
    }

    if (this.options.resolveLocalCollisions !== false)
      this.resolveLocalCollisions(combatantId, skipPlayer);
  };
  private resolveLocalCollisions = (combatantId?: string, skipPlayer = false): void => {
    const playerState = skipPlayer ? undefined : this.options.getPlayerShipState?.();
    const bodies: LocalShieldShipBody[] = this.ships.flatMap((local) => {
      const npc = this.byId.get(local.npcId);
      if (local.npcId === combatantId || npc?.combatMovement || (npc?.hullHp ?? 0) <= 0) return [];
      const definition = getShipDefinition(local.shipId);
      return definition ? [{ id: local.npcId, ship: definition, state: local, pushWeight: 1 }] : [];
    });
    if (playerState && this.options.playerShip) {
      bodies.unshift({
        id: 'player',
        ship: this.options.playerShip,
        state: playerState,
        pushWeight: 2.4,
      });
    }
    for (const contact of resolveShipShieldCollisions(bodies)) {
      if (contact.firstId === 'player') {
        this.options.onPlayerShieldContact?.(contact.normal, contact.closingDistance);
      } else if (contact.secondId === 'player') {
        this.options.onPlayerShieldContact?.(
          { x: -contact.normal.x, y: -contact.normal.y },
          contact.closingDistance
        );
      }
    }
    // Only distress-rescue ships remain fixed obstacles. All drift objects use
    // the same impulse-based asteroid shield physics instead of acting as walls.
    const obstacles = this.options.field.wrecks
      .filter(
        (wreck) =>
          !wreck.containerVariant &&
          !wreck.debrisVariant &&
          !wreck.sectionVariant &&
          !wreck.combatWreckVariant
      )
      .map((wreck) => ({
        id: wreck.id,
        position: wreck.position,
        radius: wreck.radius,
      }));
    for (const collision of resolveShipShieldObstacleCollisions(bodies, obstacles)) {
      if (collision.shipId === 'player') {
        this.options.onPlayerShieldContact?.(
          { x: -collision.normal.x, y: -collision.normal.y },
          collision.closingDistance
        );
      }
    }
    for (const body of bodies) {
      // The player runtime owns shield hits; resolving them here first
      // would swallow the actual player's visible contact event.
      if (body.id === 'player') continue;
      resolveSalvageShieldContacts(
        this.options.field,
        body.state as LocalShipState,
        body.ship.sprite.hardpoints,
        body.ship.nominalLengthMeters
      );
    }
  };
}

export function createNpcLocalSalvageService(
  options: NpcLocalSalvageOptions
): NpcLocalSalvageService {
  return new LocalSalvageService(options);
}
