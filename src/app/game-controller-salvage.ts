import {
  advanceDistressRamming,
  createDistressRammingState,
  type DistressRammingState,
} from '../systems/salvage/distress-ramming-physics';
import { localSpaceExitPoint } from '../ui/map/local-space-exit-gate';
import {
  advanceDistressTow,
  createDistressTowState,
  towShipAtExit,
  type DistressTowState,
} from '../systems/salvage/distress-tow-physics';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-service';
import type { SalvageField, SectorSalvageEvent } from '../core/salvage-types';
import type { PlayerEconomyState } from '../core/economy-types';
import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { GameAudioService } from '../systems/audio/game-audio-service';
import type { WorldLocation } from '../core/world-types';
import { playerAtLocalExit } from '../ui/map/local-space-exit-gate';
import { createSalvageSpaceViewModel } from '../features/salvage/salvage-space-view-model';
import type { SalvageEconomyService } from '../systems/economy/salvage-economy-service';
import type { NpcEconomyService } from '../systems/economy/npc-economy-service';
import type { SectorNpcState } from '../core/npc-types';
import {
  createNpcLocalSalvageService,
  type NpcLocalSalvageService,
} from '../systems/npcs/npc-local-salvage-service';
import { createSalvageLocalSpaceService, generateSalvageField } from '../systems/salvage';
import {
  getShipDefinition,
  resolveShipRuntimeSetup,
  type ShipComponentInventoryService,
  type ShipRuntimeOptions,
} from '../systems/ships';
import { createSalvageSpacePanel, type SalvageSpacePanel } from '../ui/salvage/salvage-space-panel';

export interface SalvageSceneController {
  beginDistressTow(event: SectorSalvageEvent): void;
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
      readonly obstacles?: readonly {
        readonly id: string;
        readonly position: { readonly x: number; readonly y: number };
        readonly radius: number;
      }[];
    }
  ) => void;
  readonly getCombat?: () => StrategicCombatSnapshot | null;
  readonly field?: SalvageField;
  readonly sectorEvent?: SectorSalvageEvent | null;
  readonly onDiagnoseDistress?: (eventId: string) => void;
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
  readonly state: SalvageSceneState;
}

function createNpcSalvageRuntime(
  options: SalvageSceneOptions,
  field: SalvageField,
  service: SalvageLocalService
): NpcLocalSalvageService {
  return createNpcLocalSalvageService({
    locationId: options.location.id,
    field,
    salvagers: options.sectorNpcs.filter(
      (npc) => npc.job === 'salvager' && npc.workLocationId === options.location.id
    ),
    recover: (npc, resourceId, requested) =>
      options.npcEconomy.salvageLocal(npc, resourceId, requested),
    depart: (npc) => options.npcEconomy.dispatchLoadedWorker(npc),
    playerShip: options.ship,
    getPlayerShipState: () => service.getSnapshot().ship,
  });
}

function salvageNpcShips(npcSalvage: NpcLocalSalvageService) {
  return npcSalvage.ships.flatMap((npc) => {
    const definition = getShipDefinition(npc.shipId);
    if (!definition) return [];
    return [
      {
        id: npc.npcId,
        name: npc.name,
        position: npc.position,
        headingRadians: npc.headingRadians,
        speed: npc.speed,
        phase: npc.phase,
        targetWreckId: npc.targetWreckId,
        salvageActive: npc.salvageActive,
        scanProgress: npc.scanProgress,
        nominalLengthMeters: definition.nominalLengthMeters,
        spriteUrl: definition.sprite.assetUrl,
        spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
        hardpoints: definition.sprite.hardpoints,
      },
    ];
  });
}

function salvageSceneModel(context: SalvageSceneRuntime) {
  const { options, service, npcSalvage, state } = context;
  return createSalvageSpaceViewModel(
    service.getSnapshot(),
    options.ship,
    options.player,
    options.componentInventory.list(),
    options.location.name + ' // Bergung',
    salvageNpcShips(npcSalvage),
    state.selectedNpcId,
    options.getCombat?.() ?? null,
    state.activeSectorEvent,
    state.distressTow,
    state.distressRamming,
    state.distressRepairing
  );
}

function refreshSalvageScene(context: SalvageSceneRuntime): void {
  context.state.panel?.update(salvageSceneModel(context));
}

function attackSalvageNpc(context: SalvageSceneRuntime, id: string): void {
  const { options, service, npcSalvage, field } = context;
  const target = npcSalvage.ships.find((entry) => entry.npcId === id);
  if (!target) return;
  const playerShip = service.getSnapshot().ship;
  options.onAttackNpc?.(id, {
    width: field.width,
    height: field.height,
    attackerPosition: { ...playerShip.position },
    defenderPosition: { ...target.position },
    obstacles: field.wrecks.map((wreck) => ({
      id: wreck.id,
      position: { ...wreck.position },
      radius: wreck.radius,
    })),
  });
}

function createSalvagePanel(context: SalvageSceneRuntime): SalvageSpacePanel {
  const { options, service, state } = context;
  const refresh = (): void => refreshSalvageScene(context);
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
    onInspect(wreckId) {
      service.startInspect(wreckId);
      options.log.write('BERGUNG > ANFLUG UND WRACKANALYSE');
      refresh();
    },
    onStrip(wreckId, resourceId) {
      service.startStrip(wreckId, resourceId);
      options.log.write('BERGUNG > MATERIALBERGUNG GESTARTET');
      refresh();
    },
    onRecoverComponent(wreckId) {
      service.startComponentRecovery(wreckId);
      options.log.write('BERGUNG > KOMPONENTENEXTRAKTION GESTARTET');
      refresh();
    },
    onEventChoice(choiceId) {
      const result = service.resolveSalvageEvent(choiceId);
      refresh();
      return result;
    },
    ...(options.onDiagnoseDistress ? { onDiagnoseDistress: options.onDiagnoseDistress } : {}),
    ...(options.onRepairDistress ? { onRepairDistress: options.onRepairDistress } : {}),
    ...(options.onTowDistress ? { onTowDistress: options.onTowDistress } : {}),
    ...(options.onEvacuateDistress ? { onEvacuateDistress: options.onEvacuateDistress } : {}),
    onCancel() {
      service.cancelOperation();
      options.log.write('BERGUNG > VORGANG ABGEBROCHEN');
      refresh();
    },
    onReturnToStarMap() {
      const snapshot = service.getSnapshot();
      const { width, height } = snapshot.field;
      if (!playerAtLocalExit(snapshot.ship.position, width, height)) {
        options.log.write('NAV > BITTE ZUERST DEN MARKIERTEN AUSGANG ANFLIEGEN');
        refresh();
        return;
      }
      if (
        state.activeSectorEvent?.distressStage === 'towing' &&
        (!state.distressTow ||
          !towShipAtExit(
            snapshot.ship.position,
            state.distressTow,
            localSpaceExitPoint(width, height)
          ))
      ) {
        options.log.write('SCHLEPPEN > HAVARIST MUSS MIT ZUM AUSGANG');
        return;
      }
      options.onReturnToStarMap();
    },
  });
}

function resolveCompletedSectorEvent(context: SalvageSceneRuntime): void {
  const { options, service, state } = context;
  if (
    !options.sectorEvent ||
    state.sectorEventResolved ||
    (options.sectorEvent.type !== 'special-wreck' && !options.sectorEvent.salvageRights)
  ) {
    return;
  }
  const snapshot = service.getSnapshot();
  const complete = snapshot.field.wrecks.every(
    (wreck) =>
      wreck.resources.every((resource) => resource.remainingAmount <= 0) &&
      wreck.componentStatus !== 'available'
  );
  if (!complete) return;
  state.sectorEventResolved = true;
  options.onSectorEventResolved?.(options.sectorEvent.id);
}

function tickSalvageScene(context: SalvageSceneRuntime, deltaSeconds: number): void {
  const { options, service, npcSalvage } = context;
  if (!options.isCombatActive?.()) {
    service.tick(deltaSeconds);
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
    resolveCompletedSectorEvent(context);
  }
  refreshSalvageScene(context);
}

function finishSalvageCombat(
  context: SalvageSceneRuntime,
  snapshot: StrategicCombatSnapshot
): void {
  context.service.syncCombatPose(
    snapshot.attacker.position,
    snapshot.attacker.headingRadians,
    snapshot.attacker.speed
  );
  context.npcSalvage.syncCombatPose(
    snapshot.defender.id,
    snapshot.defender.position,
    snapshot.defender.headingRadians,
    snapshot.defender.speed
  );
  refreshSalvageScene(context);
}

export function createSalvageScene(options: SalvageSceneOptions): SalvageSceneController {
  const runtime = resolveShipRuntimeSetup(options.ship, options.runtimeOptions);
  const field =
    options.field ??
    generateSalvageField(options.location.id, options.seed, options.location.dangerLevel);
  const service = createSalvageLocalSpaceService({
    field,
    setup: runtime.salvage,
    crewSkill: runtime.salvageCrewSkill,
    collect: options.economy.recover,
    collectComponent(type, componentId, sourceWreckId, cargoCapacityTons) {
      return (
        options.componentInventory.store(type, componentId, sourceWreckId, cargoCapacityTons) !==
        null
      );
    },
    approachSpeed: 85,
  });
  const context: SalvageSceneRuntime = {
    options,
    runtime,
    field,
    service,
    npcSalvage: createNpcSalvageRuntime(options, field, service),
    state: {
      selectedNpcId: options.selectedNpcId ?? null,
      sectorEventResolved: false,
      distressRepairing: false,
      activeSectorEvent: options.sectorEvent ?? null,
      distressRamming: options.sectorEvent?.type === 'distress-rescue'
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
    beginDistressRepair() {
      context.state.distressRepairing = true;
      refreshSalvageScene(context);
    },
    beginDistressTow(event) {
      context.state.activeSectorEvent = event;
      const wreck = context.field.wrecks[0];
      if (wreck) context.state.distressTow = createDistressTowState(wreck.position, wreck.rotation);
      options.log.write('SCHLEPPEN > GREIFHAKEN ABGESCHOSSEN');
      refreshSalvageScene(context);
    },
    finishCombat(snapshot) {
      finishSalvageCombat(context, snapshot);
    },
    tick(deltaSeconds) {
      tickSalvageScene(context, deltaSeconds);
    },
    destroy() {
      context.state.panel?.destroy();
      context.state.panel = null;
    },
  };
}
