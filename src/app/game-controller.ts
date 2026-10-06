import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldLocation, WorldPoint } from '../core/world-types';
import { economyResourceById, economyResources } from '../data/economy/economy-resources';
import { createSectorNpcEconomyStates } from '../data/economy/sector-npc-economy';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId, sectorPorts } from '../data/ports/sector-ports';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createPortViewModel } from '../features/port/port-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import {
  createEconomyMarketService,
  type EconomyMarketService,
} from '../systems/economy/market-service';
import {
  createMarketSituationService,
  type MarketSituationService,
} from '../systems/economy/market-situation-service';
import {
  createEconomySimulationService,
  type EconomySimulationService,
} from '../systems/economy/economy-simulation-service';
import {
  createMiningEconomyService,
  type MiningEconomyService,
} from '../systems/economy/mining-economy-service';
import {
  createSalvageEconomyService,
  type SalvageEconomyService,
} from '../systems/economy/salvage-economy-service';
import {
  createNpcEconomyService,
  type NpcEconomyService,
} from '../systems/economy/npc-economy-service';
import {
  createPlayerTradeService,
  type PlayerTradeService,
} from '../systems/economy/player-trade-service';
import { planMiningApproachRouteAsync, planPointRouteAsync } from '../systems/local-space';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import {
  canShipCarryResource,
  getAllShipDefinitions,
  getShipDefinition,
  resolveShipRuntimeSetup,
} from '../systems/ships';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createShipTestSwitcher, type ShipTestSwitcher } from '../ui/dev/ship-test-switcher';
import { createLocalSpacePanel, type LocalSpacePanel } from '../ui/local-space/local-space-panel';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createMiningLocalSpace } from './game-controller-mining';
import { createSalvageScene, type SalvageSceneController } from './game-controller-salvage';

type SceneMode = 'star-map' | 'local-space' | 'salvage-space' | 'port';

interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly navigation: NavigationService;
}

interface LocalPanelActions {
  readonly onSelectAsteroid: (id: string | null) => void;
  readonly onNavigate: (target: WorldPoint) => Promise<'safe' | 'risk' | false>;
  readonly onStartMining: () => Promise<void>;
  readonly onLongRangeScan: () => void;
  readonly onShortRangeScan: () => Promise<void>;
  readonly onMiningEventChoice: (
    choiceId: string
  ) => ReturnType<LocalSpaceService['resolveMiningEvent']>;
  readonly onCancelMining: () => void;
  readonly onReturnToStarMap: () => void;
}

interface LocalActionContext {
  readonly getSpace: () => LocalSpaceService | null;
  readonly refresh: () => void;
  readonly systemLog: SystemLogService;
  readonly returnToStarMap: () => void;
}

interface ControllerPanels {
  star: StarMapPanel | null;
  local: LocalSpacePanel | null;
  port: PortPanel | null;
}

interface ControllerEconomy {
  readonly markets: EconomyMarketService;
  readonly situations: MarketSituationService;
  readonly trade: PlayerTradeService;
  readonly simulation: EconomySimulationService;
  readonly mining: MiningEconomyService;
  readonly salvage: SalvageEconomyService;
  readonly npcs: NpcEconomyService;
}

function createControllerEconomy(): ControllerEconomy {
  const situations = createMarketSituationService(sectorPorts, economyResources, 73);
  const markets = createEconomyMarketService(sectorPorts, economyResources, {
    situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
  });
  const trade = createPlayerTradeService(markets);
  const npcStates = createSectorNpcEconomyStates();
  const simulation = createEconomySimulationService(
    markets,
    trade.player,
    economyResources,
    41,
    npcStates
  );
  return {
    markets,
    situations,
    trade,
    simulation,
    mining: createMiningEconomyService(simulation, trade),
    salvage: createSalvageEconomyService(simulation, trade),
    npcs: createNpcEconomyService(markets, simulation, economyResources, npcStates, {
      positions: Object.fromEntries(
        narrowsSector.locations.map((location) => [location.id, location.position])
      ),
    }),
  };
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

async function calculateMiningRoute(service: LocalSpaceService): Promise<readonly WorldPoint[]> {
  const options = service.getMiningRouteOptions();
  return options ? planMiningApproachRouteAsync(options) : [];
}

async function calculateScanRoute(service: LocalSpaceService): Promise<readonly WorldPoint[]> {
  const options = service.getShortRangeScanRouteOptions();
  return options ? planMiningApproachRouteAsync(options) : [];
}

async function calculatePointRoute(service: LocalSpaceService, target: WorldPoint) {
  return planPointRouteAsync(service.getPointRouteOptions(target));
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
  situations: MarketSituationService,
  simulation: EconomySimulationService,
  npcs: NpcEconomyService
): void {
  if (previousId === null && currentId !== null) {
    situations.advanceNextDay();
    simulation.advanceNextDay();
    npcs.advanceNextDay();
  }
}

function createLocalPanelActions(context: LocalActionContext): LocalPanelActions {
  let navigationRequest = 0;

  return {
    onSelectAsteroid(id) {
      context.getSpace()?.selectAsteroid(id);
      context.refresh();
    },
    async onNavigate(target) {
      const activeSpace = context.getSpace();
      if (!activeSpace) return false;
      navigationRequest += 1;
      const request = navigationRequest;
      const plan = await calculatePointRoute(activeSpace, target);
      if (
        context.getSpace() !== activeSpace ||
        request !== navigationRequest ||
        plan.route.length < 2
      ) {
        return false;
      }

      activeSpace.startNavigation(plan.route[plan.route.length - 1]!, plan.route);
      context.refresh();
      return plan.compromised ? 'risk' : 'safe';
    },
    async onStartMining() {
      const activeSpace = context.getSpace();
      if (!activeSpace) return;
      const route = await calculateMiningRoute(activeSpace);
      if (context.getSpace() !== activeSpace || route.length === 0) return;
      activeSpace.startMining(route);
      context.refresh();
    },
    onLongRangeScan() {
      context.getSpace()?.startLongRangeScan();
      context.refresh();
    },
    async onShortRangeScan() {
      const activeSpace = context.getSpace();
      if (!activeSpace) return;
      const route = await calculateScanRoute(activeSpace);
      if (context.getSpace() !== activeSpace || route.length === 0) return;
      activeSpace.startShortRangeScan(route);
      context.refresh();
    },
    onMiningEventChoice(choiceId) {
      const result = context.getSpace()?.resolveMiningEvent(choiceId) ?? null;
      context.refresh();
      return result;
    },
    onCancelMining() {
      context.getSpace()?.cancelMining();
      context.refresh();
    },
    onReturnToStarMap: context.returnToStarMap,
  };
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

function createActivePortPanel(
  root: HTMLElement,
  navigation: NavigationService,
  markets: EconomyMarketService,
  trade: PlayerTradeService,
  ship: ShipDefinition,
  onReturnToStarMap: () => void,
  onRefresh: () => void,
  log: SystemLogService
): PortPanel | null {
  const locationId = navigation.getSnapshot().currentLocationId;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  const port = locationId ? sectorPortByLocationId(locationId) : null;
  const market = locationId ? markets.getMarket(locationId) : null;
  if (!location || !port || !market) return null;
  const runtime = resolveShipRuntimeSetup(ship);

  return createPortPanel({
    root,
    model: createPortViewModel(
      port,
      market,
      trade.player,
      location,
      ship,
      runtime.cargoCapacityTons
    ),
    onReturnToStarMap,
    onBuy: (resourceId) => {
      if (!canShipCarryResource(ship, resourceId)) {
        log.write('FRACHT > MINER NIMMT NUR ROHSTOFFE AUF');
        return;
      }
      const result = trade.buy(location.id, resourceId, 1, runtime.cargoCapacityTons);
      if (!result) return;
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(`HANDEL > +${result.quantity} ${name.toUpperCase()} · ${-result.creditsDelta} CR`);
      onRefresh();
    },
    onSell: (resourceId) => {
      const result = trade.sell(location.id, resourceId, 1);
      if (!result) return;
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > -${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
  });
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
    returnToStarMap: createStarMapReturnAction(
      context.root,
      context.systemLog,
      () => mountControllerStarMap(context)
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
    log: context.systemLog,
    onReturnToStarMap: createStarMapReturnAction(
      context.root,
      context.systemLog,
      () => mountControllerStarMap(context)
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
  advanceEconomyDay(
    state.previousLocationId,
    currentLocationId,
    economy.situations,
    economy.simulation,
    economy.npcs
  );
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
