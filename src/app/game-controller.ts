import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldLocation } from '../core/world-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import { getAllShipDefinitions, getShipDefinition } from '../systems/ships';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createShipTestSwitcher, type ShipTestSwitcher } from '../ui/dev/ship-test-switcher';
import { createLocalSpacePanel, type LocalSpacePanel } from '../ui/local-space/local-space-panel';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createControllerEconomy, type ControllerEconomy } from './game-controller-economy';
import { createLocalPanelActions, type LocalPanelActions } from './game-controller-local-actions';
import { createMiningLocalSpace } from './game-controller-mining';
import { createActivePortPanel } from './game-controller-port';
import { createSalvageScene, type SalvageSceneController } from './game-controller-salvage';

type SceneMode = 'star-map' | 'local-space' | 'salvage-space' | 'port';

interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly navigation: NavigationService;
}

interface ControllerPanels {
  star: StarMapPanel | null;
  local: LocalSpacePanel | null;
  port: ReturnType<typeof createActivePortPanel>;
}

function destroyScenePanels(panels: ControllerPanels): void {
  panels.star?.destroy();
  panels.local?.destroy();
  panels.port?.destroy();
  panels.star = null;
  panels.local = null;
  panels.port = null;
}

export interface GameController {
  tick(deltaSeconds: number): void;
}

function createControllerLog(): SystemLogService {
  const log = createSystemLogService();
  log.write('SYSTEM ONLINE');
  return log;
}

function createControllerShipSwitcher(
  root: HTMLElement,
  activeShip: ShipDefinition,
  navigation: NavigationService,
  onSwitch: (ship: ShipDefinition) => void
): ShipTestSwitcher {
  return createShipTestSwitcher({
    root,
    ships: getAllShipDefinitions(),
    activeShipId: activeShip.id,
    disabled: navigation.getSnapshot().isTravelling,
    onSelect: (shipId) => {
      const nextShip = getShipDefinition(shipId);
      if (!nextShip || nextShip.id === activeShip.id) return;
      navigation.setCruiseSpeed(nextShip.navigation.cruiseSpeed);
      onSwitch(nextShip);
    },
  });
}

function requireLocalSpace(service: LocalSpaceService | null): LocalSpaceService {
  if (!service) throw new Error('Local space is not active.');
  return service;
}

// prettier-ignore
function createActiveLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  locationName: string
) {
  return createLocalSpaceViewModel(
    requireLocalSpace(service).getSnapshot(),
    ship,
    locationName + ' // Mining'
  );
}

function miningLocationById(locationId: string | null): WorldLocation | null {
  if (!locationId) return null;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  return location?.activities.mine ? location : null;
}

function currentMiningLocationName(navigation: NavigationService): string {
  return miningLocationById(navigation.getSnapshot().currentLocationId)?.name ?? 'Mining Zone';
}

function salvageLocationById(locationId: string | null): WorldLocation | null {
  if (!locationId) return null;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  return location?.activities.salvage ? location : null;
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

function advanceEconomyDay(
  previousId: string | null,
  currentId: string | null,
  economy: ControllerEconomy
): void {
  if (previousId === null && currentId !== null) {
    economy.situations.advanceNextDay();
    economy.simulation.advanceNextDay();
    economy.npcs.advanceNextDay();
  }
}

function createControllerStarPanel(options: {
  root: HTMLElement;
  navigation: NavigationService;
  log: SystemLogService;
  getModel: () => ReturnType<typeof createStarMapViewModel>;
  onEnterLocalSpace: () => void;
  onEnterSalvageSpace: () => void;
  onDock: () => void;
}): StarMapPanel {
  let panel: StarMapPanel | null = null;
  panel = createStarMapPanel({
    root: options.root,
    model: options.getModel(),
    log: options.log,
    onSelectLocation: (id) => {
      const snapshot = options.navigation.getSnapshot();
      if (snapshot.currentLocationId === id && !snapshot.isTravelling) {
        if (miningLocationById(id)) {
          options.onEnterLocalSpace();
          return;
        }
        if (salvageLocationById(id)) {
          options.onEnterSalvageSpace();
          return;
        }
      }
      options.navigation.selectDestination(id);
      panel?.update(options.getModel());
    },
    onStartTravel: () => {
      options.navigation.startTravel();
      options.log.write('NAV > FLUG GESTARTET');
      panel?.update(options.getModel());
    },
    onDock: options.onDock,
  });
  return panel;
}

function createControllerStarModel(navigation: NavigationService, ship: ShipDefinition) {
  return createStarMapViewModel(narrowsSector, navigation.getSnapshot(), ship);
}

function createControllerLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  navigation: NavigationService
) {
  return createActiveLocalModel(service, ship, currentMiningLocationName(navigation));
}

interface ControllerRuntimeState {
  activeShip: ShipDefinition;
  mode: SceneMode;
  readonly panels: ControllerPanels;
  shipSwitcher: ShipTestSwitcher | null;
  localSpace: LocalSpaceService | null;
  salvageScene: SalvageSceneController | null;
  localSpaceSeed: number;
  salvageSpaceSeed: number;
  visitCounter: number;
  previousLocationId: string | null;
}

interface ControllerRuntimeContext {
  readonly root: HTMLElement;
  readonly navigation: NavigationService;
  readonly systemLog: SystemLogService;
  readonly economy: ControllerEconomy;
  readonly state: ControllerRuntimeState;
}

function controllerStarModel(context: ControllerRuntimeContext) {
  return createControllerStarModel(context.navigation, context.state.activeShip);
}

function controllerLocalModel(context: ControllerRuntimeContext) {
  return createControllerLocalModel(
    context.state.localSpace,
    context.state.activeShip,
    context.navigation
  );
}

function destroyControllerSalvage(context: ControllerRuntimeContext): void {
  context.state.salvageScene?.destroy();
  context.state.salvageScene = null;
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
  state.localSpace = null;
  state.mode = 'star-map';
  state.panels.star = createControllerStarPanel({
    root: context.root,
    navigation: context.navigation,
    log: context.systemLog,
    getModel: () => controllerStarModel(context),
    onEnterLocalSpace: () =>
      runSceneZoomTransition(context.root, () => mountControllerMining(context)),
    onEnterSalvageSpace: () =>
      runSceneZoomTransition(context.root, () => mountControllerSalvage(context)),
    onDock: () => runSceneZoomTransition(context.root, () => mountControllerPort(context)),
  });
  mountControllerSwitcher(context);
}

function mountControllerPort(context: ControllerRuntimeContext, announce = true): void {
  const { state, economy } = context;
  const locationId = context.navigation.getSnapshot().currentLocationId;
  destroyControllerSalvage(context);
  state.localSpace = null;
  destroyScenePanels(state.panels);
  state.panels.port = createActivePortPanel(
    context.root,
    context.navigation,
    economy.markets,
    economy.trade,
    state.activeShip,
    () => runSceneZoomTransition(context.root, () => mountControllerStarMap(context)),
    () => mountControllerPort(context, false),
    context.systemLog
  );
  if (!state.panels.port) return;
  state.mode = 'port';
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
  destroyScenePanels(state.panels);
  state.mode = 'local-space';
  const location = miningLocationById(context.navigation.getSnapshot().currentLocationId);
  if (!location) return mountControllerStarMap(context);
  if (!reuseSeed || state.localSpaceSeed === 0) {
    state.localSpaceSeed = localSeed((state.visitCounter += 1));
  }
  state.localSpace = createMiningLocalSpace(
    state.activeShip,
    state.localSpaceSeed,
    economy.mining,
    location
  );
  context.systemLog.write(
    reuseSeed ? 'TEST > SCHIFFSWECHSEL' : 'LOCAL OPS > ' + location.name.toUpperCase()
  );
  state.panels.local = createLocalSpacePanel({
    root: context.root,
    model: controllerLocalModel(context),
    log: context.systemLog,
    ...controllerLocalActions(context),
  });
  mountControllerSwitcher(context);
}

function mountControllerSalvage(context: ControllerRuntimeContext, reuseSeed = false): void {
  const { state, economy } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  state.localSpace = null;
  const location = salvageLocationById(context.navigation.getSnapshot().currentLocationId);
  if (!location) return mountControllerStarMap(context);
  state.mode = 'salvage-space';
  if (!reuseSeed || state.salvageSpaceSeed === 0) {
    state.salvageSpaceSeed = localSeed((state.visitCounter += 1));
  }
  state.salvageScene = createSalvageScene({
    root: context.root,
    ship: state.activeShip,
    seed: state.salvageSpaceSeed,
    location,
    economy: economy.salvage,
    player: economy.trade.player,
    componentInventory: economy.components,
    log: context.systemLog,
    onReturnToStarMap: createStarMapReturnAction(context.root, context.systemLog, () =>
      mountControllerStarMap(context)
    ),
  });
  mountControllerSwitcher(context);
}

function tickController(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state, economy } = context;
  const navigationSnapshot = context.navigation.tick(deltaSeconds);
  const currentLocationId = navigationSnapshot.currentLocationId;
  if (enteredMiningLocation(state.mode, state.previousLocationId, currentLocationId)) {
    runSceneZoomTransition(context.root, () => mountControllerMining(context));
  } else if (enteredSalvageLocation(state.mode, state.previousLocationId, currentLocationId)) {
    runSceneZoomTransition(context.root, () => mountControllerSalvage(context));
  }
  advanceEconomyDay(state.previousLocationId, currentLocationId, economy);
  state.previousLocationId = currentLocationId;
  state.shipSwitcher?.update(state.activeShip.id, navigationSnapshot.isTravelling);
  if (state.mode === 'star-map') state.panels.star?.update(controllerStarModel(context));
  else if (state.mode === 'local-space' && state.localSpace) {
    state.localSpace.tick(deltaSeconds);
    state.panels.local?.update(controllerLocalModel(context));
  } else if (state.mode === 'salvage-space') {
    state.salvageScene?.tick(deltaSeconds);
  }
}

export function createGameController(options: GameControllerOptions): GameController {
  const context: ControllerRuntimeContext = {
    root: options.root,
    navigation: options.navigation,
    systemLog: createControllerLog(),
    economy: createControllerEconomy(),
    state: {
      activeShip: options.ship,
      mode: 'star-map',
      panels: { star: null, local: null, port: null },
      shipSwitcher: null,
      localSpace: null,
      salvageScene: null,
      localSpaceSeed: 0,
      salvageSpaceSeed: 0,
      visitCounter: 0,
      previousLocationId: options.navigation.getSnapshot().currentLocationId,
    },
  };
  mountControllerStarMap(context);
  return {
    tick(deltaSeconds) {
      tickController(context, deltaSeconds);
    },
  };
}
