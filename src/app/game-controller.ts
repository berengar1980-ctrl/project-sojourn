import { localMiningCombatArena } from './game-controller-combat';
import type { SalvageField } from '../core/salvage-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { combatResultMessage } from '../systems/combat/combat-result-summary';
import { showCampaignCombatSummary } from '../ui/combat/campaign-combat-summary';
import { createGameAudioService } from '../systems/audio/game-audio-service';
import { createCrewRosterService } from '../systems/crew';
import { createStarMapEngagementService } from '../systems/combat';
import { createShipLoadoutService } from '../systems/ships';
import { createLocalSpacePanel } from '../ui/local-space/local-space-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createSettingsMenu } from '../ui/settings/settings-menu';
import { createControllerEconomy } from './game-controller-economy';
import { createPlayerCombatant } from './game-controller-combat';
import { startCombatBoarding } from './game-controller-combat-boarding';
import { mountCombatScene } from './game-controller-combat-scene';
import { createControllerShipSwitcher } from './game-controller-ship-switcher';
import { createControllerStarPanel } from './game-controller-star-map';
import type {
  ControllerRuntimeContext,
  ControllerRuntimeState,
} from './game-controller-runtime-types';
import {
  tickEconomy,
  completeDistressTowOnArrival,
  controllerSalvageEventCallbacks,
  controllerSalvageExitAction,
  destroyControllerBoarding,
  destroyControllerCombat,
  destroyGameController,
  destroyControllerSalvage,
  destroyScenePanels,
  sectorEventLocation,
} from './game-controller-events';
import { createLocalPanelActions, type LocalPanelActions } from './game-controller-local-actions';
import { miningLocationById, salvageLocationById } from './game-controller-local-model';
import { ensureMiningCombatWorld } from './game-controller-mining-runtime';
import { createActivePortPanel } from './game-controller-port';
import { createSalvageScene } from './game-controller-salvage';
import { generateSectorSalvageEventField } from '../systems/salvage';
import {
  controllerLocalModel,
  controllerShipRuntimeOptions,
  controllerStarModel,
  createControllerLog,
  createStarMapReturnAction,
  enteredMiningLocation,
  enteredSalvageLocation,
  localSeed,
  syncControllerNavigationCrewPerformance,
} from './game-controller-models';
import type { GameControllerOptions, GameController } from './game-controller-types';

export type { GameController } from './game-controller-types';
function mountControllerSwitcher(context: ControllerRuntimeContext): void {
  const { state } = context;
  state.shipSwitcher?.destroy();
  state.shipSwitcher = createControllerShipSwitcher(
    context.root,
    state.activeShip,
    context.navigation,
    (nextShip) => {
      state.activeShip = nextShip;
      context.economy.salvageEvents.setPlayerSalvageEligible(nextShip.role === 'salvage');
      context.systemLog.write('TEST > SCHIFF ' + nextShip.name.toUpperCase());
      if (state.mode === 'local-space') mountControllerMining(context, true);
      else if (state.mode === 'salvage-space') mountControllerSalvage(context, true);
      else if (state.mode === 'port') mountControllerPort(context);
      else mountControllerStarMap(context);
    }
  );
}
function mountControllerStarMap(context: ControllerRuntimeContext): void {
  const { state } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  state.embeddedCombat = null;
  state.mode = 'star-map';
  syncControllerNavigationCrewPerformance(context);
  context.audio.clearPlayerRcs();
  state.panels.star = createControllerStarPanel({
    root: context.root,
    navigation: context.navigation,
    log: context.systemLog,
    getModel: () => controllerStarModel(context),
    onEnterLocalSpace: () =>
      runSceneZoomTransition(context.root, () => mountControllerMining(context)),
    onEnterSalvageSpace: () =>
      runSceneZoomTransition(context.root, () => mountControllerSalvage(context)),
    onSelectNpc: (id) => {
      state.selectedNpcId = id || null;
      if (id) context.navigation.selectDestination(null);
      state.panels.star?.update(controllerStarModel(context));
    },
    onAttackNpc: (id) => {
      state.selectedNpcId = id;
      context.engagements.attackNpc(id);
      state.panels.star?.update(controllerStarModel(context));
    },
    onDock: () => runSceneZoomTransition(context.root, () => mountControllerPort(context)),
    eventById: (id) =>
      context.economy.salvageEvents.playerVisible.find((event) => event.id === id) ?? null,
    onAcceptEvent: (id) => context.economy.salvageEvents.acceptForPlayer(id),
  });
  mountControllerSwitcher(context);
}
function mountControllerPort(context: ControllerRuntimeContext, announce = true): void {
  const { state, economy } = context;
  const locationId = context.navigation.getSnapshot().currentLocationId;
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  destroyScenePanels(state.panels);
  state.panels.port = createActivePortPanel(
    context.root,
    context.navigation,
    economy.markets,
    economy.trade,
    state.activeShip,
    context.crew,
    context.loadouts,
    economy.marketIntel,
    economy.components,
    economy.shipyardResearch,
    economy.situations.currentDay,
    () => runSceneZoomTransition(context.root, () => mountControllerStarMap(context)),
    () => mountControllerPort(context, false),
    context.systemLog,
    state.ownedShipIds,
    (nextShip) => {
      state.activeShip = nextShip;
      context.economy.salvageEvents.setPlayerSalvageEligible(nextShip.role === 'salvage');
      mountControllerPort(context, false);
    }
  );
  if (!state.panels.port) return;
  state.mode = 'port';
  context.audio.clearPlayerRcs();
  if (announce) context.systemLog.write('DOCK > ' + (locationId ?? 'UNKNOWN').toUpperCase());
  mountControllerSwitcher(context);
}
function controllerLocalActions(context: ControllerRuntimeContext): LocalPanelActions {
  return createLocalPanelActions({
    getSpace: () => context.state.localSpace,
    refresh: () => {
      if (context.state.localSpace) {
        context.state.panels.local?.update(controllerLocalModel(context));
      }
    },
    systemLog: context.systemLog,
    returnToStarMap: createStarMapReturnAction(context.root, context.systemLog, () =>
      mountControllerStarMap(context)
    ),
  });
}
function mountControllerMining(
  context: ControllerRuntimeContext,
  reuseSeed = false,
  preserveField = false
): void {
  const { state } = context;
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  destroyScenePanels(state.panels);
  state.mode = 'local-space';
  state.embeddedCombat = null;
  const location = miningLocationById(context.navigation.getSnapshot().currentLocationId);
  if (!location) return mountControllerStarMap(context);
  if (!reuseSeed || state.localSpaceSeed === 0) {
    state.localSpaceSeed = localSeed((state.visitCounter += 1));
  }
  ensureMiningCombatWorld(context, location, preserveField);
  context.systemLog.write(
    reuseSeed ? 'TEST > SCHIFFSWECHSEL' : 'LOCAL OPS > ' + location.name.toUpperCase()
  );
  state.panels.local = createLocalSpacePanel({
    root: context.root,
    model: controllerLocalModel(context),
    log: context.systemLog,
    ...controllerLocalActions(context),
    onSelectNpc: (id) => {
      state.selectedNpcId = id;
      state.panels.local?.update(controllerLocalModel(context));
    },
    onAttackNpc: (id) => {
      state.selectedNpcId = id;
      const local = state.localSpace?.getSnapshot();
      const target = state.localNpcMining?.ships.find((entry) => entry.npcId === id);
      if (!local || !target) return;
      const arena = localMiningCombatArena(
        local.instance,
        state.localSpace!.getShipWorldVelocity()
      );
      const started = context.engagements.engageNpcInArena(id, {
        ...arena,
        defenderPosition: { ...target.position },
      });
      if (started) {
        state.embeddedCombat = 'local-space';
        context.systemLog.write('COMBAT > GEFECHT IM ASTEROIDENFELD');
        state.panels.local?.update(controllerLocalModel(context));
      }
    },
    onCombatGrapple: () => {
      context.engagements.activePlayerCombat()?.fireGrapple('attacker');
    },
    onCombatTactic: (tactic) => {
      context.engagements.activePlayerCombat()?.setTactic('attacker', tactic);
      state.panels.local?.update(controllerLocalModel(context));
    },
  });
  mountControllerSwitcher(context);
}
function mountControllerSalvage(
  context: ControllerRuntimeContext,
  reuseSeed = false,
  preservedField?: SalvageField,
  finalCombat?: StrategicCombatSnapshot
): void {
  const { state, economy } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  const currentLocationId = context.navigation.getSnapshot().currentLocationId;
  const sectorEvent = context.economy.salvageEvents.event(currentLocationId);
  if (sectorEvent && state.activeShip.role !== 'salvage') {
    context.systemLog.write('BERGUNG > HILFERUF NUR MIT BERGUNGSSCHIFF VERFÜGBAR');
    return mountControllerStarMap(context);
  }
  const location =
    salvageLocationById(currentLocationId) ?? sectorEventLocation(context, currentLocationId);
  if (!location) return mountControllerStarMap(context);
  state.mode = 'salvage-space';
  state.embeddedCombat = null;
  if (!reuseSeed || state.salvageSpaceSeed === 0) {
    state.salvageSpaceSeed = localSeed((state.visitCounter += 1));
  }
  state.salvageScene = createSalvageScene({
    root: context.root,
    ship: state.activeShip,
    seed: sectorEvent?.fieldSeed ?? state.salvageSpaceSeed,
    location,
    ...(preservedField
      ? { field: preservedField }
      : sectorEvent
        ? {
            field:
              state.salvageEventFields.get(sectorEvent.id) ??
              (() => {
                const field = generateSectorSalvageEventField(sectorEvent);
                state.salvageEventFields.set(sectorEvent.id, field);
                return field;
              })(),
            sectorEvent,
          }
        : {}),
    economy: economy.salvage,
    npcEconomy: economy.npcs,
    sectorNpcs: economy.sectorNpcs.npcs,
    player: economy.trade.player,
    componentInventory: economy.components,
    runtimeOptions: controllerShipRuntimeOptions(context, state.activeShip),
    log: context.systemLog,
    audio: context.audio,
    selectedNpcId: state.selectedNpcId,
    onSelectNpc: (id) => {
      state.selectedNpcId = id;
    },
    onAttackNpc: (id, arena) => {
      state.selectedNpcId = id;
      if (context.engagements.engageNpcInArena(id, arena)) {
        state.embeddedCombat = 'salvage-space';
        context.systemLog.write('COMBAT > GEFECHT IM WRACKFELD');
      }
    },
    getCombat: () =>
      state.embeddedCombat === 'salvage-space'
        ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
        : null,
    isCombatActive: () => state.embeddedCombat === 'salvage-space',
    onCombatGrapple: () => {
      context.engagements.activePlayerCombat()?.fireGrapple('attacker');
    },
    onCombatTactic: (tactic) => {
      context.engagements.activePlayerCombat()?.setTactic('attacker', tactic);
    },
    ...controllerSalvageEventCallbacks(context, {
      mountStarMap: () => mountControllerStarMap(context),
      mountSalvage: (preserveSeed = false) => mountControllerSalvage(context, preserveSeed),
    }),
    onReturnToStarMap: controllerSalvageExitAction(context, () => mountControllerStarMap(context)),
  });
  if (finalCombat) state.salvageScene?.finishCombat(finalCombat);
  mountControllerSwitcher(context);
}
function resolveControllerCombat(context: ControllerRuntimeContext): void {
  const { state } = context;
  const activeCombat = context.engagements.activePlayerCombat();
  if (
    activeCombat &&
    state.mode !== 'combat' &&
    state.mode !== 'boarding' &&
    state.embeddedCombat === null
  ) {
    mountCombatScene(context, () => mountControllerStarMap(context));
  }
  if (!activeCombat?.getSnapshot().winner || state.embeddedCombat === null) return;
  const snapshot = activeCombat.getSnapshot();
  if (snapshot.boardingInitiator) {
    const origin = state.embeddedCombat;
    const preservedSalvageField =
      origin === 'salvage-space' ? state.salvageScene?.getField() : undefined;
    if (origin === 'local-space') {
      state.localSpace?.syncCombatPose(
        snapshot.attacker.position,
        snapshot.attacker.headingRadians,
        snapshot.attacker.speed
      );
      state.localNpcMining?.syncCombatPose(
        snapshot.defender.id,
        snapshot.defender.position,
        snapshot.defender.headingRadians,
        snapshot.defender.speed
      );
    }
    startCombatBoarding(context, snapshot, (boardingOutcome) => {
      if (boardingOutcome === 'enemy_win') return mountControllerStarMap(context);
      if (origin === 'local-space') mountControllerMining(context, true, true);
      else if (origin === 'salvage-space')
        mountControllerSalvage(context, true, preservedSalvageField, snapshot);
      else mountControllerStarMap(context);
    });
    return;
  }
  context.systemLog.write(combatResultMessage(snapshot));
  context.systemLog.write('COMBAT > ' + snapshot.lastEvent.toUpperCase());
  if (state.embeddedCombat === 'local-space') {
    state.localSpace?.syncCombatPose(
      snapshot.attacker.position,
      snapshot.attacker.headingRadians,
      snapshot.attacker.speed
    );
    state.localNpcMining?.syncCombatPose(
      snapshot.defender.id,
      snapshot.defender.position,
      snapshot.defender.headingRadians,
      snapshot.defender.speed
    );
  } else {
    state.salvageScene?.finishCombat(snapshot);
  }
  context.engagements.finishPlayerCombat();
  state.embeddedCombat = null;
  showCampaignCombatSummary(context.root, snapshot, () => {
    if (snapshot.attacker.hullHp <= 0) mountControllerStarMap(context);
  });
}

function handleControllerLocationEntry(
  context: ControllerRuntimeContext,
  currentLocationId: string | null
): void {
  const { state, economy } = context;
  if (enteredMiningLocation(state.mode, state.previousLocationId, currentLocationId)) {
    runSceneZoomTransition(context.root, () => mountControllerMining(context));
    return;
  }
  const enteredSalvage =
    state.mode === 'star-map' &&
    state.previousLocationId !== currentLocationId &&
    (enteredSalvageLocation(state.mode, state.previousLocationId, currentLocationId) ||
      economy.salvageEvents.event(currentLocationId) !== null);
  if (enteredSalvage) {
    if (economy.salvageEvents.event(currentLocationId))
      economy.salvageEvents.acceptForPlayer(currentLocationId!);
    runSceneZoomTransition(context.root, () => mountControllerSalvage(context));
  }
}

function tickControllerScene(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state } = context;
  if (state.mode === 'combat') {
    state.combatPanel?.update();
    return;
  }
  if (state.mode === 'star-map') {
    state.panels.star?.update(controllerStarModel(context));
    return;
  }
  if (state.mode === 'salvage-space') {
    state.salvageScene?.tick(deltaSeconds);
    return;
  }
  if (state.mode !== 'local-space' || !state.localSpace) return;
  if (state.embeddedCombat !== 'local-space') {
    state.localSpace.tick(deltaSeconds);
    const localSnapshot = state.localSpace.getSnapshot();
    context.audio.updatePlayerRcs(
      state.activeShip.sprite.hardpoints,
      localSnapshot.instance.ship,
      performance.now() / 1000
    );
    state.localNpcMining?.tick(deltaSeconds);
  }
  state.panels.local?.update(controllerLocalModel(context));
}

function tickController(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state, economy } = context;
  economy.salvageEvents.setPlayerSalvageEligible(state.activeShip.role === 'salvage');
  economy.sectorNpcs.tick(deltaSeconds);
  economy.npcSalvageEvents.tick();
  economy.npcs.tick(deltaSeconds);
  context.engagements.syncPlayerPursuitTarget();
  const navigationSnapshot = context.navigation.tick(deltaSeconds);
  context.engagements.tick(deltaSeconds);
  resolveControllerCombat(context);
  const currentLocationId = navigationSnapshot.currentLocationId;
  if (!navigationSnapshot.isTravelling && state.previousLocationId !== currentLocationId) {
    completeDistressTowOnArrival(context, currentLocationId);
  }
  handleControllerLocationEntry(context, currentLocationId);
  tickEconomy(context, deltaSeconds);
  state.previousLocationId = currentLocationId;
  state.shipSwitcher?.update(state.activeShip.id, navigationSnapshot.isTravelling);
  tickControllerScene(context, deltaSeconds);
}

export function createGameController(options: GameControllerOptions): GameController {
  const state: ControllerRuntimeState = {
    activeShip: options.ship,
    ownedShipIds: new Set([options.ship.id]),
    mode: 'star-map',
    panels: { star: null, local: null, port: null },
    shipSwitcher: null,
    localSpace: null,
    localNpcMining: null,
    salvageScene: null,
    combatPanel: null,
    boardingPanel: null,
    embeddedCombat: null,
    selectedNpcId: null,
    localSpaceSeed: 0,
    salvageSpaceSeed: 0,
    salvageEventFields: new Map(),
    visitCounter: 0,
    previousLocationId: options.navigation.getSnapshot().currentLocationId,
  };
  const systemLog = createControllerLog();
  const economy = createControllerEconomy(options.navigation);
  const crew = createCrewRosterService();
  const loadouts = createShipLoadoutService();
  const engagements = createStarMapEngagementService({
    navigation: options.navigation,
    sectorNpcs: economy.sectorNpcs,
    getPlayerShip: () => state.activeShip,
    getPlayerCombatant: () =>
      createPlayerCombatant(state.activeShip, {
        ...crew.runtimeOptions(state.activeShip),
        installed: loadouts.get(state.activeShip),
      }),
    log: (message) => systemLog.write(message),
  });
  const context: ControllerRuntimeContext = {
    root: options.root,
    navigation: options.navigation,
    systemLog,
    economy,
    crew,
    loadouts,
    audio: createGameAudioService(),
    engagements,
    state,
  };
  economy.salvageEvents.advanceDay(
    economy.situations.currentDay,
    options.navigation.getSnapshot().currentPosition,
    state.activeShip.role === 'salvage'
  );
  const settingsMenu = createSettingsMenu(context.audio, options.onReturnToMainMenu);
  mountControllerStarMap(context);
  return {
    tick(deltaSeconds) {
      tickController(context, deltaSeconds);
    },
    destroy: () => destroyGameController(context, settingsMenu),
  };
}
