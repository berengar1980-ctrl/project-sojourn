import { measurePerformance } from '../core/performance-diagnostics';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import { advanceSalvagePirateResponse } from './game-controller-salvage-pirates';
import { completeSalvageSectorEvent } from './game-controller-salvage-event-progress';
import type { StrategicCombatBystander } from '../systems/combat/strategic-combat-bystander-types';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import {
  createSalvageSecurityDrone,
  salvageDroneBystanders,
  salvageDroneShipObstacles,
  tickSalvageSecurityDrone,
  salvageDroneCanSee,
} from './game-controller-salvage-drone';
import {
  advanceDistressRamming,
  createDistressRammingState,
  type DistressRammingState,
} from '../systems/salvage/distress-ramming-physics';
import {
  advanceDistressTow,
  createDistressTowState,
  distressTowWithinRange,
  type DistressTowState,
} from '../systems/salvage/distress-tow-physics';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import { salvageFieldCombatArena } from '../systems/combat/field-combat-arena';
import type { CombatVisualAsteroid } from '../systems/combat/strategic-combat-types';
import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';
import type { SalvageField, SectorSalvageEvent } from '../core/salvage-types';
import type { PlayerEconomyState } from '../core/economy-types';
import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { GameAudioService } from '../systems/audio/game-audio-service';
import type { WorldLocation, WorldPoint } from '../core/world-types';
import { createSalvageSpaceViewModel } from '../features/salvage/salvage-space-view-model';
import type { SalvageEconomyService } from '../systems/economy/salvage-economy-service';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import type { SectorNpcState } from '../core/npc-types';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import { createSalvageLocalSpaceService, generateSalvageField } from '../systems/salvage';
import { grantDistressSalvageRights } from '../systems/salvage/distress-salvage-rights';
import {
  resolveShipLocalCruiseSpeed,
  engineSpeedMultiplier,
  resolveShipRuntimeSetup,
  type ShipComponentInventoryService,
  type ShipRuntimeOptions,
} from '../systems/ships';
import { createSalvageSpacePanel, type SalvageSpacePanel } from '../ui/salvage/salvage-space-panel';
import { salvageNpcShips, salvagePirateShips } from './game-controller-salvage-npc-view';
import {
  finishSalvageCombat,
  syncSalvageCombatField,
} from './game-controller-salvage-combat-return';
import { returnToStarMapFromSalvage } from './game-controller-salvage-exit';
import { createWreckClaimActions, wreckClaimOwners } from './game-controller-salvage-claims';
import { createNpcSalvageRuntime } from './game-controller-salvage-npc-runtime';
import {
  requestDistressDiagnosis,
  tickDistressDiagnosis,
} from './game-controller-salvage-diagnosis';

export interface SalvageSceneController {
  getField(): SalvageField;
  beginDistressTow(event: SectorSalvageEvent): void;
  canAttachDistressTow(): boolean;
  updateSectorEvent(event: SectorSalvageEvent | null): void;
  beginDistressRepair(): void;
  tick(deltaSeconds: number): void;
  finishCombat(snapshot: StrategicCombatSnapshot): void;
  destroy(): void;
}

interface SalvageSceneOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly seed: number;
  readonly location: WorldLocation;
  readonly economy: SalvageEconomyService;
  readonly npcEconomy: NpcEconomyService;
  readonly sectorNpcs: readonly SectorNpcState[];
  readonly wreckClaims: WreckClaimRegistry;
  readonly getCurrentDay: () => number;
  readonly player: PlayerEconomyState;
  readonly componentInventory: ShipComponentInventoryService;
  readonly runtimeOptions?: ShipRuntimeOptions;
  readonly log: SystemLogService;
  readonly audio: GameAudioService;
  readonly onReturnToStarMap: () => void;
  readonly selectedNpcId?: string | null;
  readonly onSelectNpc?: (id: string | null) => void;
  readonly onAttackNpc?: (
    id: string,
    arena: {
      readonly width: number;
      readonly height: number;
      readonly attackerPosition: { readonly x: number; readonly y: number };
      readonly defenderPosition: { readonly x: number; readonly y: number };
      readonly defenderHeadingRadians?: number;
      readonly defenderVelocity?: { readonly x: number; readonly y: number };
      readonly attackerVelocity?: { readonly x: number; readonly y: number };
      readonly attackerHeadingRadians?: number;
      readonly asteroids?: readonly CombatVisualAsteroid[];
      readonly obstacles?: readonly {
        readonly id: string;
        readonly position: { readonly x: number; readonly y: number };
        readonly radius: number;
      }[];
    }
  ) => void;
  readonly getCombat?: () => StrategicCombatSnapshot | null;
  readonly resolveDrone?: (field: SalvageField) => AsteroidSecurityDrone;
  readonly onUnauthorizedSalvage?: (field: SalvageField, wreckId: string) => void;
  readonly resolvePirateTraffic?: (field: SalvageField) => LocalPirateTraffic;
  readonly getNpcCombats?: () => readonly StrategicCombatSnapshot[];
  readonly onPirateAttack?: (
    field: SalvageField,
    pirateId: string,
    targetId: string,
    piratePosition: WorldPoint,
    targetPosition: WorldPoint
  ) => boolean;
  readonly onDroneAttack?: (
    field: SalvageField,
    pirateId: string,
    piratePosition: WorldPoint,
    dronePosition: WorldPoint
  ) => boolean;
  readonly onCombatBystanders?: (bystanders: readonly StrategicCombatBystander[]) => void;
  readonly field?: SalvageField;
  readonly sectorEvent?: SectorSalvageEvent | null;
  readonly onDiagnoseDistress?: (eventId: string) => void;
  readonly onBoardWreck?: (wreckId: string) => void;
  readonly onRepairDistress?: (eventId: string) => void;
  readonly onTowDistress?: (eventId: string) => void;
  readonly onEvacuateDistress?: (eventId: string) => void;
  readonly onSectorEventResolved?: (eventId: string) => void;
  readonly isCombatActive?: () => boolean;
  readonly onCombatTactic?: (tactic: 'fight' | 'kite' | 'flee' | 'minefield') => void;
  readonly onCombatGrapple?: () => void;
}

type SalvageLocalService = ReturnType<typeof createSalvageLocalSpaceService>;

interface SalvageSceneState {
  selectedNpcId: string | null;
  sectorEventResolved: boolean;
  activeSectorEvent: SectorSalvageEvent | null;
  distressTow: DistressTowState | null;
  distressRamming: DistressRammingState | null;
  distressRepairing: boolean;
  panel: SalvageSpacePanel | null;
}

interface SalvageSceneRuntime {
  readonly options: SalvageSceneOptions;
  readonly runtime: ReturnType<typeof resolveShipRuntimeSetup>;
  readonly field: SalvageField;
  readonly service: SalvageLocalService;
  readonly npcSalvage: NpcLocalSalvageService;
  readonly pirates: LocalPirateTraffic;
  readonly drone: AsteroidSecurityDrone;
  readonly state: SalvageSceneState;
}

function salvageSceneModel(context: SalvageSceneRuntime) {
  const { options, service, npcSalvage, state } = context;
  const model = createSalvageSpaceViewModel(
    service.getSnapshot(),
    options.ship,
    options.player,
    options.componentInventory.list(),
    options.location.name + ' // Bergung',
    [...salvageNpcShips(npcSalvage), ...salvagePirateShips(context.pirates, options.sectorNpcs)],
    state.selectedNpcId,
    options.getCombat?.() ?? null,
    state.activeSectorEvent,
    state.distressTow,
    state.distressRamming,
    state.distressRepairing
  );
  return {
    ...model,
    securityDrone: context.drone.snapshot(),
    wreckClaimOwners: wreckClaimOwners(context.field, options.wreckClaims, options.getCurrentDay()),
  };
}

function refreshSalvageScene(context: SalvageSceneRuntime): void {
  context.state.panel?.update(salvageSceneModel(context));
}

function attackSalvageNpc(context: SalvageSceneRuntime, id: string): void {
  const { options, service, npcSalvage, field } = context;
  const target =
    npcSalvage.ships.find((entry) => entry.npcId === id) ??
    context.pirates.snapshot(options.sectorNpcs).find((entry) => entry.npcId === id);
  if (!target) return;
  const playerShip = service.getSnapshot().ship;
  options.onAttackNpc?.(id, {
    ...salvageFieldCombatArena(field),
    attackerPosition: { ...playerShip.position },
    defenderPosition: { ...target.position },
    attackerHeadingRadians: playerShip.headingRadians,
    defenderHeadingRadians: target.headingRadians,
    defenderVelocity: {
      x: Math.cos(target.headingRadians) * target.speed,
      y: Math.sin(target.headingRadians) * target.speed,
    },
    attackerVelocity: {
      x: Math.cos(playerShip.headingRadians) * playerShip.speed,
      y: Math.sin(playerShip.headingRadians) * playerShip.speed,
    },
  });
}

function createSalvagePanel(context: SalvageSceneRuntime): SalvageSpacePanel {
  const { options, service, state } = context;
  const refresh = (): void => refreshSalvageScene(context);
  const claims = createWreckClaimActions({
    field: context.field,
    role: options.ship.role,
    player: options.player,
    wreckClaims: options.wreckClaims,
    getCurrentDay: options.getCurrentDay,
    log: options.log,
    refresh,
    onUnauthorizedAttempt: (wreckId) => {
      if (salvageDroneCanSee(context.drone, field, service.getSnapshot().ship.position))
        options.onUnauthorizedSalvage?.(field, wreckId);
    },
  });
  return createSalvageSpacePanel({
    root: options.root,
    model: salvageSceneModel(context),
    log: options.log,
    onSelectWreck(id) {
      service.selectWreck(id);
      refresh();
    },
    onSelectNpc(id) {
      state.selectedNpcId = id;
      options.onSelectNpc?.(id);
      refresh();
    },
    onAttackNpc(id) {
      attackSalvageNpc(context, id);
    },
    onCombatGrapple() {
      options.onCombatGrapple?.();
      refresh();
    },
    onCombatTactic(tactic) {
      options.onCombatTactic?.(tactic);
      refresh();
    },
    onNavigate(target) {
      service.startNavigation(target);
      options.log.write('NAV > PUNKTROUTE IM WRACKFELD');
      refresh();
    },
    onLongRangeScan() {
      service.startLongRangeScan();
      options.log.write('SCAN > LANGREICHWEITENSCAN GESTARTET');
      refresh();
    },
    onStartDistressDiagnosis(eventId) {
      requestDistressDiagnosis(context, eventId);
      refresh();
    },
    onBoardWreck(wreckId) {
      options.onBoardWreck?.(wreckId);
    },
    onClaimWreck: claims.claim,
    onInspect(wreckId) {
      service.startInspect(wreckId);
      options.log.write('BERGUNG > ANFLUG UND WRACKANALYSE');
      refresh();
    },
    onStrip(wreckId, resourceId) {
      if (!claims.canWork(wreckId)) return;
      service.startStrip(wreckId, resourceId);
      options.log.write('BERGUNG > MATERIALBERGUNG GESTARTET');
      refresh();
    },
    onRecoverComponent(wreckId) {
      if (!claims.canWork(wreckId)) return;
      service.startComponentRecovery(wreckId);
      options.log.write('BERGUNG > KOMPONENTENEXTRAKTION GESTARTET');
      refresh();
    },
    onEventChoice(choiceId) {
      const result = service.resolveSalvageEvent(choiceId);
      refresh();
      return result;
    },
    ...(options.onRepairDistress ? { onRepairDistress: options.onRepairDistress } : {}),
    ...(options.onTowDistress ? { onTowDistress: options.onTowDistress } : {}),
    ...(options.onEvacuateDistress ? { onEvacuateDistress: options.onEvacuateDistress } : {}),
    onCancel() {
      service.cancelOperation();
      options.log.write('BERGUNG > VORGANG ABGEBROCHEN');
      refresh();
    },
    onReturnToStarMap() {
      returnToStarMapFromSalvage({
        service,
        activeSectorEvent: state.activeSectorEvent,
        distressTow: state.distressTow,
        log: options.log,
        onReturn: options.onReturnToStarMap,
        refresh,
      });
    },
  });
}

const lastSalvagePresentation = new WeakMap<SalvageSceneRuntime, number>();
const SALVAGE_PRESENTATION_INTERVAL_MS = 1000 / 24;

function tickSalvageScene(context: SalvageSceneRuntime, deltaSeconds: number): void {
  const { options, service, npcSalvage } = context;
  const combat = options.isCombatActive?.() ? (options.getCombat?.() ?? null) : null;
  advanceSalvagePirateResponse({
    field: context.field,
    drone: context.drone,
    pirates: context.pirates,
    sectorNpcs: options.sectorNpcs,
    salvagers: npcSalvage.ships,
    playerPosition: combat?.attacker.position ?? service.getSnapshot().ship.position,
    playerRadius: Math.max(18, options.ship.nominalLengthMeters * 0.35),
    dt: deltaSeconds,
    playerCombat: combat,
    npcCombats: options.getNpcCombats?.(),
    onPirateAttack: (pirateId, targetId, piratePosition, targetPosition) =>
      options.onPirateAttack?.(context.field, pirateId, targetId, piratePosition, targetPosition) ?? false,
    onDroneAttack: (pirateId, piratePosition) =>
      options.onDroneAttack?.(context.field, pirateId, piratePosition, context.drone.position) ?? false,
  });
  if (combat) {
    options.onCombatBystanders?.(
      salvageDroneBystanders(
        combat,
        npcSalvage.ships,
        context.drone,
        context.field.sourceLocationId,
        context.pirates.snapshot(options.sectorNpcs)
      )
    );
    syncSalvageCombatField(context.field, combat);
    service.syncCombatPose(
      combat.attacker.position,
      combat.attacker.headingRadians,
      combat.attacker.speed
    );
    npcSalvage.tick(deltaSeconds, combat.defender.id, true);
  } else {
    tickDistressDiagnosis(context, deltaSeconds);
    if (context.state.distressRamming && !context.state.distressTow) {
      const snapshot = service.getSnapshot();
      const wreck = context.field.wrecks[0];
      if (wreck) {
        const result = advanceDistressRamming(
          context.state.distressRamming,
          snapshot.ship.position,
          wreck.position,
          options.ship.nominalLengthMeters * 0.42,
          wreck.radius,
          deltaSeconds
        );
        context.state.distressRamming = result.state;
        context.field.wrecks[0] = { ...wreck, position: result.position };
      }
    }
    if (context.state.distressTow) {
      const player = service.getSnapshot().ship;
      context.state.distressTow = advanceDistressTow(
        context.state.distressTow,
        player.position,
        player.headingRadians,
        deltaSeconds
      );
      const wreck = context.field.wrecks[0];
      if (wreck) {
        context.field.wrecks[0] = {
          ...wreck,
          position: { ...context.state.distressTow.position },
          rotation: context.state.distressTow.headingRadians,
        };
      }
    }
    options.audio.updatePlayerRcs(
      options.ship.sprite.hardpoints,
      service.getSnapshot().ship,
      performance.now() / 1000
    );
    npcSalvage.tick(deltaSeconds);
    context.state.sectorEventResolved = completeSalvageSectorEvent(
      context.state.activeSectorEvent,
      context.state.sectorEventResolved,
      service.getSnapshot(),
      options.onSectorEventResolved
    );
  }
  const now = performance.now();
  if (
    now - (lastSalvagePresentation.get(context) ?? -Infinity) >=
    SALVAGE_PRESENTATION_INTERVAL_MS
  ) {
    lastSalvagePresentation.set(context, now);
    measurePerformance('scene.salvage.presentation', () => refreshSalvageScene(context));
  }
}

export function createSalvageScene(options: SalvageSceneOptions): SalvageSceneController {
  const runtime = resolveShipRuntimeSetup(options.ship, options.runtimeOptions);
  const field =
    options.field ??
    generateSalvageField(options.location.id, options.seed, options.location.dangerLevel);
  options.wreckClaims.restoreField(field);
  const service = createSalvageLocalSpaceService({
    field,
    setup: runtime.salvage,
    crewSkill: runtime.salvageCrewSkill,
    scanAvailable: runtime.scanAvailable,
    sensorModifier: runtime.sensorModifier,
    sensorCrewSkill: runtime.sensorCrewSkill,
    collect: options.economy.recover,
    collectComponent(type, componentId, sourceWreckId, cargoCapacityTons) {
      return (
        options.componentInventory.store(type, componentId, sourceWreckId, cargoCapacityTons) !==
        null
      );
    },
    approachSpeed: resolveShipLocalCruiseSpeed(
      options.ship,
      runtime.installed,
      runtime.stationSkills.piloting
    ),
    turnRateMultiplier:
      engineSpeedMultiplier(runtime.installed) * runtime.crewEffects.piloting.turnRateMultiplier,
    hardpoints: options.ship.sprite.hardpoints,
    shipLengthMeters: options.ship.nominalLengthMeters,
  });
  const context: SalvageSceneRuntime = {
    options,
    runtime,
    field,
    service,
    npcSalvage: createNpcSalvageRuntime(options, field, service),
    pirates:
      options.resolvePirateTraffic?.(field) ?? new LocalPirateTraffic(field.width, field.height, field.seed),
    drone: options.resolveDrone?.(field) ?? createSalvageSecurityDrone(field, options.wreckClaims),
    state: {
      selectedNpcId: options.selectedNpcId ?? null,
      sectorEventResolved: false,
      distressRepairing: false,
      activeSectorEvent: options.sectorEvent ?? null,
      distressRamming:
        options.sectorEvent?.type === 'distress-rescue'
          ? createDistressRammingState(service.getSnapshot().ship.position)
          : null,
      distressTow:
        options.sectorEvent?.distressStage === 'towing' && field.wrecks[0]
          ? createDistressTowState(field.wrecks[0].position, field.wrecks[0].rotation)
          : null,
      panel: null,
    },
  };
  context.state.panel = createSalvagePanel(context);

  options.log.write('SALVAGE OPS > ' + options.location.name.toUpperCase());
  if (!runtime.salvage.available) {
    options.log.write('BERGUNG > KEIN EINSATZFÄHIGES BERGUNGSSYSTEM');
  }

  return {
    getField() {
      return field;
    },
    canAttachDistressTow() {
      const wreck = context.field.wrecks[0];
      return !!wreck && distressTowWithinRange(service.getSnapshot().ship.position, wreck.position);
    },
    updateSectorEvent(event) {
      context.state.activeSectorEvent = event;
      if (event?.salvageRights && context.field.wrecks[0]?.resources.length === 0) {
        grantDistressSalvageRights(context.field, event);
      }
      refreshSalvageScene(context);
    },
    beginDistressRepair() {
      context.state.distressRepairing = true;
      refreshSalvageScene(context);
    },
    beginDistressTow(event) {
      if (!this.canAttachDistressTow()) return;
      context.state.activeSectorEvent = event;
      const wreck = context.field.wrecks[0];
      if (wreck) context.state.distressTow = createDistressTowState(wreck.position, wreck.rotation);
      options.log.write('SCHLEPPEN > GREIFHAKEN ABGESCHOSSEN');
      refreshSalvageScene(context);
    },
    finishCombat(snapshot) {
      finishSalvageCombat(context.field, context.service, context.npcSalvage, snapshot);
      refreshSalvageScene(context);
    },
    tick(deltaSeconds) {
      tickSalvageScene(context, deltaSeconds);
    },
    destroy() {
      options.wreckClaims.rememberField(field, context.drone.exportState());
      context.state.panel?.destroy();
      context.state.panel = null;
    },
  };
}
