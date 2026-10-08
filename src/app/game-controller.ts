import type { ShipDefinition } from '../core/ship-types';
import { createGameAudioService } from '../systems/audio/game-audio-service';
import type { SystemLogService } from '../core/system-log-types';
import { createCrewRosterService } from '../systems/crew';
import { createStarMapEngagementService } from '../systems/combat';
import type { NavigationService } from '../systems/navigation';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import {
  createShipLoadoutService,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createLocalSpacePanel } from '../ui/local-space/local-space-panel';
import { createStrategicCombatPanel } from '../ui/combat/strategic-combat-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createSettingsMenu } from '../ui/settings/settings-menu';
import { createControllerEconomy } from './game-controller-economy';
import { createPlayerCombatant } from './game-controller-combat';
import { createControllerShipSwitcher } from './game-controller-ship-switcher';
import { createControllerStarModel, createControllerStarPanel } from './game-controller-star-map';
import type {
  ControllerRuntimeContext,
  ControllerRuntimeState,
  SceneMode,
} from './game-controller-runtime-types';
import {
  advanceEconomyDay,
  controllerSalvageEventCallbacks,
  destroyControllerBoarding,
  destroyControllerCombat,
  destroyControllerSalvage,
  destroyScenePanels,
  sectorEventLocation,
} from './game-controller-events';
import { createLocalPanelActions, type LocalPanelActions } from './game-controller-local-actions';
import {
  createControllerLocalModel,
  miningLocationById,
  salvageLocationById,
} from './game-controller-local-model';
import { createMiningLocalSpace } from './game-controller-mining';
import { createActivePortPanel } from './game-controller-port';
import { createSalvageScene } from './game-controller-salvage';
import { generateSectorSalvageEventField } from '../systems/salvage';

interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly navigation: NavigationService;
}

export interface GameController {
  tick(deltaSeconds: number): void;
}

function createControllerLog(): SystemLogService {
  const log = createSystemLogService();
  log.write('SYSTEM ONLINE');
  return log;
}

function createStarMapReturnAction(
  root: HTMLElement,
  systemLog: SystemLogService,
  mountStarMap: () => void
): () => void {
  return () => {
    systemLog.write('NAV > STERNKARTE');
    runSceneZoomTransition(root, mountStarMap);
  };
}

function localSeed(visit: number): number {
  return (Date.now() + visit * 2654435761) >>> 0;
}

function enteredMiningLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && miningLocationById(currentId) !== null;
}

function enteredSalvageLocation(
  mode: SceneMode,
  previousId: string | null,
  currentId: string | null
): boolean {
  return mode === 'star-map' && previousId !== currentId && salvageLocationById(currentId) !== null;
}

function controllerShipRuntimeOptions(
  context: ControllerRuntimeContext,
  ship: ShipDefinition = context.state.activeShip
): ShipRuntimeOptions {
  return {
    ...context.crew.runtimeOptions(ship),
    installed: context.loadouts.get(ship),
  };
}

function syncControllerNavigationCrewPerformance(context: ControllerRuntimeContext): void {
  const ship = context.state.activeShip;
  const runtime = resolveShipRuntimeSetup(ship, controllerShipRuntimeOptions(context, ship));
  context.navigation.setCruiseSpeed(
    ship.navigation.cruiseSpeed * runtime.crewEffects.piloting.travelSpeedMultiplier
  );
}

function controllerStarModel(context: ControllerRuntimeContext) {
  const runtime = resolveShipRuntimeSetup(
    context.state.activeShip,
    controllerShipRuntimeOptions(context)
  );
  return createControllerStarModel(
    context.navigation,
    context.state.activeShip,
    context.economy,
    context.state.selectedNpcId,
    runtime.sensorCrewSkill,
    runtime.sensorModifier
  );
}

function controllerLocalModel(context: ControllerRuntimeContext) {
  return createControllerLocalModel(
    context.state.localSpace,
    context.state.activeShip,
    context.navigation,
    context.state.localNpcMining,
    context.state.selectedNpcId,
    context.state.embeddedCombat === 'local-space'
      ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
      : null
  );
}

function mountControllerSwitcher(context: ControllerRuntimeContext): void {
  const { state } = context;
  state.shipSwitcher?.destroy();
  state.shipSwitcher = createControllerShipSwitcher(
    context.root,
    state.activeShip,
    context.navigation,
    (nextShip) => {
      state.activeShip = nextShip;
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
    eventById: (id) => context.economy.salvageEvents.event(id),
  });
  mountControllerSwitcher(context);
}

function mountControllerCombat(context: ControllerRuntimeContext): void {
  const combat = context.engagements.activePlayerCombat();
  if (!combat) return;
  const { state } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  state.embeddedCombat = null;
  state.mode = 'combat';
  context.audio.clearPlayerRcs();
  state.combatPanel = createStrategicCombatPanel({
    root: context.root,
    combat,
    onReturn: () => {
      context.engagements.finishPlayerCombat();
      runSceneZoomTransition(context.root, () => mountControllerStarMap(context));
    },
  });
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
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
    context.systemLog
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

function mountControllerMining(context: ControllerRuntimeContext, reuseSeed = false): void {
  const { state, economy } = context;
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
  state.localSpace = createMiningLocalSpace(
    state.activeShip,
    state.localSpaceSeed,
    economy.mining,
    location,
    controllerShipRuntimeOptions(context, state.activeShip)
  );
  state.localNpcMining = createNpcLocalMiningService({
    locationId: location.id,
    width: state.localSpace.getSnapshot().instance.width,
    height: state.localSpace.getSnapshot().instance.height,
    miners: economy.sectorNpcs.npcs.filter(
      (npc) => npc.job === 'miner' && npc.workLocationId === location.id
    ),
    getAsteroids: () => state.localSpace?.getSnapshot().instance.asteroids ?? [],
    mine: (npc, resourceId, requested) => economy.npcs.mineLocal(npc, resourceId, requested),
    depart: (npc) => economy.npcs.dispatchLoadedWorker(npc),
    playerShip: state.activeShip,
    getPlayerShipState: () => state.localSpace!.getSnapshot().instance.ship,
  });
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
      const started = context.engagements.engageNpcInArena(id, {
        width: local.instance.width,
        height: local.instance.height,
        attackerPosition: { ...local.instance.ship.position },
        defenderPosition: { ...target.position },
        obstacles: local.instance.asteroids.map((asteroid) => ({
          id: asteroid.id,
          position: { ...asteroid.position },
          radius: asteroid.radius,
        })),
      });
      if (started) {
        state.embeddedCombat = 'local-space';
        context.systemLog.write('COMBAT > GEFECHT IM ASTEROIDENFELD');
        state.panels.local?.update(controllerLocalModel(context));
      }
    },
    onCombatTactic: (tactic) => {
      context.engagements.activePlayerCombat()?.setTactic('attacker', tactic);
      state.panels.local?.update(controllerLocalModel(context));
    },
  });
  mountControllerSwitcher(context);
}

function mountControllerSalvage(context: ControllerRuntimeContext, reuseSeed = false): void {
  const { state, economy } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  const currentLocationId = context.navigation.getSnapshot().currentLocationId;
  const sectorEvent = context.economy.salvageEvents.event(currentLocationId);
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
    ...(sectorEvent
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
    onCombatTactic: (tactic) => {
      context.engagements.activePlayerCombat()?.setTactic('attacker', tactic);
    },
    ...controllerSalvageEventCallbacks(context, {
      mountStarMap: () => mountControllerStarMap(context),
      mountSalvage: (preserveSeed = false) => mountControllerSalvage(context, preserveSeed),
    }),
    onReturnToStarMap: createStarMapReturnAction(context.root, context.systemLog, () =>
      mountControllerStarMap(context)
    ),
  });
  mountControllerSwitcher(context);
}

function resolveControllerCombat(context: ControllerRuntimeContext): void {
  const { state } = context;
  const activeCombat = context.engagements.activePlayerCombat();
  if (activeCombat && state.mode !== 'combat' && state.embeddedCombat === null) {
    mountControllerCombat(context);
  }
  if (!activeCombat?.getSnapshot().winner || state.embeddedCombat === null) return;

  const snapshot = activeCombat.getSnapshot();
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
  economy.sectorNpcs.tick(deltaSeconds);
  economy.npcSalvageEvents.tick();
  economy.npcs.tick(deltaSeconds);
  context.engagements.syncPlayerPursuitTarget();

  const navigationSnapshot = context.navigation.tick(deltaSeconds);
  context.engagements.tick(deltaSeconds);
  resolveControllerCombat(context);

  const currentLocationId = navigationSnapshot.currentLocationId;
  handleControllerLocationEntry(context, currentLocationId);
  advanceEconomyDay(state.previousLocationId, currentLocationId, context);
  state.previousLocationId = currentLocationId;
  state.shipSwitcher?.update(state.activeShip.id, navigationSnapshot.isTravelling);
  tickControllerScene(context, deltaSeconds);
}

export function createGameController(options: GameControllerOptions): GameController {
  const state: ControllerRuntimeState = {
    activeShip: options.ship,
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
  createSettingsMenu(context.audio);
  mountControllerStarMap(context);
  return {
    tick(deltaSeconds) {
      tickController(context, deltaSeconds);
    },
  };
}
