import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { syncFieldTrafficImpulses } from '../systems/combat/field-combat-arena';
import { salvageFieldPhysicsBodies } from '../systems/salvage/salvage-container-motion';
import { measurePerformance } from '../core/performance-diagnostics';
import { attackSalvageNpc } from './game-controller-salvage-attack';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import { advanceSalvagePirateResponse } from './game-controller-salvage-pirates';
import { completeSalvageSectorEvent } from './game-controller-salvage-event-progress';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import {
  createSalvageSecurityDrone,
  salvageDroneBystanders,
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
import type { SalvageField, SectorSalvageEvent } from '../core/salvage-types';
import { createSalvageSpaceViewModel } from '../features/salvage/salvage-space-view-model';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import { createSalvageLocalSpaceService, generateSalvageField } from '../systems/salvage';
import { grantDistressSalvageRights } from '../systems/salvage/distress-salvage-rights';
import {
  resolveShipLocalCruiseSpeed,
  engineSpeedMultiplier,
  resolveShipRuntimeSetup,
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
import type { SalvageSceneOptions, SalvageSceneController } from './game-controller-salvage-types';
export type { SalvageSceneOptions, SalvageSceneController } from './game-controller-salvage-types';
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
  const escaped = options.escapedFieldShipIds?.();
  const model = createSalvageSpaceViewModel(
    service.getSnapshot(),
    options.ship,
    options.player,
    options.componentInventory.list(),
    options.location.name + ' // Bergung',
    [
      ...salvageNpcShips(npcSalvage),
      ...salvagePirateShips(context.pirates, options.sectorNpcs),
    ].filter((ship) => !escaped?.has(ship.id)),
    state.selectedNpcId,
    options.getCombat?.() ?? null,
    state.activeSectorEvent,
    state.distressTow,
    state.distressRamming,
    state.distressRepairing
  );
  return {
    ...model,
    fleet: model.combat ? (options.getFleet?.() ?? null) : null,
    securityDrone: context.drone.snapshot(),
    npcCombats: (options.getNpcCombats?.() ?? []).filter((duel) =>
      [duel.attacker.id, duel.defender.id].every((id) =>
        options.sectorNpcs.some(
          (npc) => npc.id === id && npc.locationId === context.field.sourceLocationId
        )
      )
    ),
    wreckClaimOwners: wreckClaimOwners(context.field, options.wreckClaims, options.getCurrentDay()),
  };
}

function refreshSalvageScene(context: SalvageSceneRuntime): void {
  context.state.panel?.update(salvageSceneModel(context));
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
      if (salvageDroneCanSee(context.drone, context.field, service.getSnapshot().ship.position))
        options.onUnauthorizedSalvage?.(context.field, wreckId);
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
      attackSalvageNpc(options, context.field, service, context.npcSalvage, context.pirates, id);
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

function fieldDuels(options: SalvageSceneOptions) {
  return options.getFieldDuels?.() ?? options.getNpcCombats?.() ?? [];
}

function tickSalvageTraffic(
  context: SalvageSceneRuntime,
  deltaSeconds: number,
  combat: StrategicCombatSnapshot | null,
  duels: readonly StrategicCombatSnapshot[]
): void {
  const { options, service, npcSalvage } = context;
  const playerBody = service.getSnapshot().ship;
  // During player combat the PvP solver is the only source of the drone pose.
  if (combat?.defender.id === 'security-drone:' + context.field.sourceLocationId) {
    context.drone.syncCombatPose(
      combat.defender.position,
      combat.defender.headingRadians,
      combat.defender.speed,
      combat.defender.hullHp > 0
    );
  }
  advanceSalvagePirateResponse({
    field: context.field,
    drone: context.drone,
    pirates: context.pirates,
    sectorNpcs: options.sectorNpcs,
    salvagers: npcSalvage.ships,
    playerPosition: combat?.attacker.position ?? service.getSnapshot().ship.position,
    playerRadius: Math.max(18, options.ship.nominalLengthMeters * 0.35),
    ...(!combat && {
      playerBody: { id: 'player', ship: options.ship, state: playerBody, pushWeight: 2.4 },
    }),
    ...(options.onFreighterExit && { onFreighterExit: options.onFreighterExit }),
    dt: deltaSeconds,
    playerCombat: combat,
    npcCombats: duels,
    onPirateAttack: (pirateId, targetId, piratePosition, targetPosition) =>
      options.onPirateAttack?.(context.field, pirateId, targetId, piratePosition, targetPosition) ??
      false,
    onDroneAttack: (pirateId, piratePosition) =>
      options.onDroneAttack?.(context.field, pirateId, piratePosition, context.drone.position) ??
      false,
  });
}

const lastSalvagePresentation = new WeakMap<SalvageSceneRuntime, number>();
const SALVAGE_PRESENTATION_INTERVAL_MS = 1000 / 24;

function tickSalvageScene(context: SalvageSceneRuntime, deltaSeconds: number): void {
  const { options, service, npcSalvage } = context;
  const combat = options.isCombatActive?.() ? (options.getCombat?.() ?? null) : null;
  const duels = fieldDuels(options).filter(
    (duel) => duel.arena.backdropSeed === context.field.seed
  );
  const fieldCombat = combat ?? duels[0];
  const playerBody = service.getSnapshot().ship;
  if (fieldCombat) syncSalvageCombatField(context.field, fieldCombat);
  tickSalvageTraffic(context, deltaSeconds, combat, duels);
  if (combat) {
    service.syncCombatPose(
      combat.attacker.position,
      combat.attacker.headingRadians,
      combat.attacker.speed
    );
    npcSalvage.tick(deltaSeconds, combat.defender.id, true);
  } else {
    tickDistressDiagnosis(context, deltaSeconds, Boolean(fieldCombat));
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
  if (fieldCombat) {
    const contacts = salvageDroneBystanders(
      null,
      npcSalvage.ships,
      context.drone,
      context.field.sourceLocationId,
      context.pirates.snapshot(options.sectorNpcs)
    );
    options.onCombatBystanders?.(
      context.field,
      combat
        ? contacts
        : [
            ...contacts,
            {
              id: 'player',
              shipId: options.ship.id,
              position: playerBody.position,
              headingRadians: playerBody.headingRadians,
            },
          ]
    );
    syncFieldTrafficImpulses(salvageFieldPhysicsBodies(context.field), fieldCombat.arena);
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

function announceSalvageScene(
  options: SalvageSceneOptions,
  runtime: ReturnType<typeof resolveShipRuntimeSetup>
): void {
  options.log.write('SALVAGE OPS > ' + options.location.name.toUpperCase());
  if (!runtime.salvage.available) options.log.write('BERGUNG > KEIN EINSATZFÄHIGES BERGUNGSSYSTEM');
}

export function createSalvageScene(options: SalvageSceneOptions): SalvageSceneController {
  const runtime = resolveShipRuntimeSetup(options.ship, options.runtimeOptions);
  const field =
    options.field ??
    generateSalvageField(options.location.id, options.seed, options.location.dangerLevel);
  options.wreckClaims.restoreField(field);
  if (options.sectorEvent) options.economy.prepareEventField?.(field);
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
  if (options.playerStart) service.syncCombatPose(options.playerStart, 0, 0);
  const context: SalvageSceneRuntime = {
    options,
    runtime,
    field,
    service,
    npcSalvage: createNpcSalvageRuntime(options, field, service),
    pirates:
      options.resolvePirateTraffic?.(field) ??
      new LocalPirateTraffic(field.width, field.height, field.seed),
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

  announceSalvageScene(options, runtime);
  return sceneController(context);
}
function sceneController(context: SalvageSceneRuntime): SalvageSceneController {
  const { field, options, service } = context;
  return {
    body(id) {
      if (id === 'player') return service.getSnapshot().ship;
      if (id === 'security-drone:' + field.sourceLocationId) return context.drone;
      return context.pirates.body(id) ?? context.npcSalvage.ships.find((ship) => ship.npcId === id);
    },
    attackNpc(id, playerInitiated) {
      attackSalvageNpc(
        options,
        field,
        service,
        context.npcSalvage,
        context.pirates,
        id,
        playerInitiated
      );
    },
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
        options.economy.prepareEventField?.(context.field);
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
      options.onLeaveField?.(field);
      options.wreckClaims.rememberField(field, context.drone.exportState());
      context.state.panel?.destroy();
      context.state.panel = null;
    },
  };
}
