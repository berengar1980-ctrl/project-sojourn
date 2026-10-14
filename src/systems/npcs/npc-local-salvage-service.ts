import { seededLocalGate } from '../../core/local-space-exit';
import { resolveSalvageShieldContacts } from '../salvage/salvage-container-motion';
import type { LocalShipState } from '../../core/local-space-types';
import type { SectorNpcState } from '../../core/npc-types';
import type { ShipDefinition } from '../../core/ship-types';
import type { SalvageEventChoice, SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { WorldPoint } from '../../core/world-types';
import { createSalvageEventController } from '../salvage/salvage-event-service';
import { createSalvageFieldService } from '../salvage/salvage-field-service';
import {
  resolveShipShieldCollisions,
  resolveShipShieldObstacleCollisions,
  type LocalShieldShipBody,
} from '../local-space/ship-shield-collision';
import { getShipDefinition, resolveShipRuntimeSetup, stationFactor } from '../ships';
import { ensureNpcInstalledComponents } from './npc-upgrade-service';

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
  readonly onPlayerShieldContact?: (normal: WorldPoint, overlap: number) => void;
}

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
    (wreck) =>
      !occupied.has(wreck.id) &&
      (wreckRemaining(wreck) > 0 || wreck.componentStatus === 'available')
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
    this.syncArrivals();
  }
  private beginExit = (ship: LocalNpcSalvagerState): void => {
    ship.phase = 'exiting';
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
        position: { ...entry },
        headingRadians: 0,
        speed: FLIGHT_SPEED,
        phase: 'entering',
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
    const wreck = chooseWreck(npc, this.options.field, occupied);
    if (!wreck) {
      this.beginExit(ship);
      return false;
    }
    ship.targetWreckId = wreck.id;
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
    const accepted = this.options.recover(npc, deposit.resourceId, requested);
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
    if (moveToward(ship, workPoint(npc.id, wreck), FLIGHT_SPEED, dt)) {
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
  tick = (deltaSeconds: number): void => {
    const dt = Math.min(Math.max(0, deltaSeconds), 0.08);
    if (dt <= 0) return;
    this.syncArrivals();

    for (let index = this.ships.length - 1; index >= 0; index -= 1) {
      const ship = this.ships[index]!;
      const npc = this.byId.get(ship.npcId);
      if (
        !npc ||
        npc.hullHp <= 0 ||
        (npc.combatRecoverySeconds ?? 0) > 0 ||
        npc.locationId !== this.options.locationId
      ) {
        this.ships.splice(index, 1);
        continue;
      }

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
      if (moveToward(ship, ship.exitPoint, FLIGHT_SPEED * 1.15, dt)) {
        this.ships.splice(index, 1);
        this.options.depart(npc);
      }
    }

    const playerState = this.options.getPlayerShipState?.();
    const bodies: LocalShieldShipBody[] = this.ships.flatMap((local) => {
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
      .filter((wreck) => !wreck.containerVariant && !wreck.debrisVariant && !wreck.sectionVariant)
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
