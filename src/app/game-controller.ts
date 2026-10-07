import type { ShipDefinition } from '../core/ship-types';
import { createGameAudioService, type GameAudioService } from '../systems/audio/game-audio-service';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldLocation } from '../core/world-types';
import { createCrewRosterService, type CrewRosterService } from '../systems/crew';
import {
  createStarMapEngagementService,
  type StarMapEngagementService,
  type StrategicCombatantSetup,
} from '../systems/combat';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createLocalSpaceViewModel } from '../features/local-space/local-space-view-model';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import type { LocalSpaceService } from '../systems/local-space';
import type { NavigationService } from '../systems/navigation';
import {
  createNpcLocalMiningService,
  type NpcLocalMiningService,
} from '../systems/npcs/npc-local-mining-service';
import {
  createShipLoadoutService,
  getAllShipDefinitions,
  getShipComponent,
  getShipDefinition,
  resolveShipRuntimeSetup,
  type ShipLoadoutService,
  type ShipRuntimeOptions,
} from '../systems/ships';
import { createSystemLogService } from '../systems/system-log/system-log-service';
import { createShipTestSwitcher, type ShipTestSwitcher } from '../ui/dev/ship-test-switcher';
import { createLocalSpacePanel, type LocalSpacePanel } from '../ui/local-space/local-space-panel';
import {
  createStrategicCombatPanel,
  type StrategicCombatPanel,
} from '../ui/combat/strategic-combat-panel';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createControllerEconomy, type ControllerEconomy } from './game-controller-economy';
import { createLocalPanelActions, type LocalPanelActions } from './game-controller-local-actions';
import { createMiningLocalSpace } from './game-controller-mining';
import { createActivePortPanel } from './game-controller-port';
import { createSalvageScene, type SalvageSceneController } from './game-controller-salvage';

type SceneMode = 'star-map' | 'local-space' | 'salvage-space' | 'port' | 'combat';

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
  locationName: string,
  npcMining: NpcLocalMiningService | null
) {
  const npcShips = (npcMining?.ships ?? []).flatMap((npc) => {
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
        targetAsteroidId: npc.targetAsteroidId,
        laserActive: npc.laserActive,
        scanProgress: npc.scanProgress,
        nominalLengthMeters: definition.nominalLengthMeters,
        spriteUrl: definition.sprite.assetUrl,
        spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
        hardpoints: definition.sprite.hardpoints,
      },
    ];
  });

  return createLocalSpaceViewModel(
    requireLocalSpace(service).getSnapshot(),
    ship,
    locationName + ' // Mining',
    npcShips
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
  if (currentId !== null && previousId !== currentId) {
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
  onSelectNpc: (id: string) => void;
  onAttackNpc: (id: string) => void;
  onDock: () => void;
}): StarMapPanel {
  let panel: StarMapPanel | null = null;
  panel = createStarMapPanel({
    root: options.root,
    model: options.getModel(),
    log: options.log,
    onSelectLocation: (id) => {
      options.onSelectNpc('');
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
    onSelectNpc: options.onSelectNpc,
    onAttackNpc: options.onAttackNpc,
    onStartTravel: () => {
      options.navigation.startTravel();
      options.log.write('NAV > FLUG GESTARTET');
      panel?.update(options.getModel());
    },
    onDock: options.onDock,
  });
  return panel;
}

function createControllerStarModel(
  navigation: NavigationService,
  ship: ShipDefinition,
  economy: ControllerEconomy,
  selectedNpcId: string | null
) {
  return createStarMapViewModel(
    narrowsSector,
    navigation.getSnapshot(),
    ship,
    economy.sectorNpcs.npcs.flatMap((npc) => {
      const definition = getShipDefinition(npc.shipId);
      if (!definition) return [];
      return [
        {
          id: npc.id,
          name: npc.name,
          job: npc.job,
          position: economy.sectorNpcs.livePosition(npc),
          headingRadians: economy.sectorNpcs.liveHeading(npc),
          isTravelling: economy.sectorNpcs.isTravelling(npc),
          activity: npc.activity,
          combatMode: economy.sectorNpcs.combatMode(npc),
          nominalLengthMeters: definition.nominalLengthMeters,
          spriteUrl: definition.sprite.assetUrl,
          spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
          hardpoints: definition.sprite.hardpoints,
        },
      ];
    }),
    selectedNpcId
  );
}

function createControllerLocalModel(
  service: LocalSpaceService | null,
  ship: ShipDefinition,
  navigation: NavigationService,
  npcMining: NpcLocalMiningService | null
) {
  return createActiveLocalModel(
    service,
    ship,
    currentMiningLocationName(navigation),
    npcMining
  );
}

interface ControllerRuntimeState {
  activeShip: ShipDefinition;
  mode: SceneMode;
  readonly panels: ControllerPanels;
  shipSwitcher: ShipTestSwitcher | null;
  localSpace: LocalSpaceService | null;
  localNpcMining: NpcLocalMiningService | null;
  salvageScene: SalvageSceneController | null;
  combatPanel: StrategicCombatPanel | null;
  selectedNpcId: string | null;
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
  readonly crew: CrewRosterService;
  readonly loadouts: ShipLoadoutService;
  readonly audio: GameAudioService;
  readonly engagements: StarMapEngagementService;
  readonly state: ControllerRuntimeState;
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

function controllerPlayerCombatant(context: ControllerRuntimeContext): StrategicCombatantSetup {
  const ship = context.state.activeShip;
  const runtime = resolveShipRuntimeSetup(ship, controllerShipRuntimeOptions(context, ship));
  const weapons = (runtime.installed.weapon ?? []).flatMap((id) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon ? [component] : [];
  });
  return {
    id: 'player',
    name: ship.name,
    shipId: ship.id,
    shieldHp: runtime.shieldMaxHp,
    hullHp: runtime.hullMaxHp,
    weapons,
    hitChance: 0.72 + runtime.crewEffects.sensors.weaponHitChanceBonus,
    dodgeChance: runtime.crewEffects.piloting.dodgeChance,
    damageMultiplier: runtime.crewEffects.weapons.damageMultiplier,
    criticalChance: runtime.crewEffects.weapons.criticalChance,
    cycleTimeMultiplier: runtime.crewEffects.weapons.cycleTimeMultiplier,
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
  return createControllerStarModel(
    context.navigation,
    context.state.activeShip,
    context.economy,
    context.state.selectedNpcId
  );
}

function controllerLocalModel(context: ControllerRuntimeContext) {
  return createControllerLocalModel(
    context.state.localSpace,
    context.state.activeShip,
    context.navigation,
    context.state.localNpcMining
  );
}

function destroyControllerCombat(context: ControllerRuntimeContext): void {
  context.state.combatPanel?.destroy();
  context.state.combatPanel = null;
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
  destroyControllerCombat(context);
  state.localSpace = null;
  state.localNpcMining = null;
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
  state.localSpace = null;
  state.localNpcMining = null;
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
    mine: (npc, resourceId, requested) =>
      economy.npcs.mineLocal(npc, resourceId, requested),
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
  });
  mountControllerSwitcher(context);
}

function mountControllerSalvage(context: ControllerRuntimeContext, reuseSeed = false): void {
  const { state, economy } = context;
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  state.localSpace = null;
  state.localNpcMining = null;
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
    npcEconomy: economy.npcs,
    sectorNpcs: economy.sectorNpcs.npcs,
    player: economy.trade.player,
    componentInventory: economy.components,
    runtimeOptions: controllerShipRuntimeOptions(context, state.activeShip),
    log: context.systemLog,
    audio: context.audio,
    onReturnToStarMap: createStarMapReturnAction(context.root, context.systemLog, () =>
      mountControllerStarMap(context)
    ),
  });
  mountControllerSwitcher(context);
}

function tickController(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const { state, economy } = context;
  economy.sectorNpcs.tick(deltaSeconds);
  context.engagements.syncPlayerPursuitTarget();
  const navigationSnapshot = context.navigation.tick(deltaSeconds);
  context.engagements.tick(deltaSeconds);
  if (context.engagements.activePlayerCombat() && state.mode !== 'combat') {
    mountControllerCombat(context);
  }
  const currentLocationId = navigationSnapshot.currentLocationId;
  if (enteredMiningLocation(state.mode, state.previousLocationId, currentLocationId)) {
    runSceneZoomTransition(context.root, () => mountControllerMining(context));
  } else if (enteredSalvageLocation(state.mode, state.previousLocationId, currentLocationId)) {
    runSceneZoomTransition(context.root, () => mountControllerSalvage(context));
  }
  advanceEconomyDay(state.previousLocationId, currentLocationId, economy);
  state.previousLocationId = currentLocationId;
  state.shipSwitcher?.update(state.activeShip.id, navigationSnapshot.isTravelling);
  if (state.mode === 'combat') {
    state.combatPanel?.update();
  } else if (state.mode === 'star-map') state.panels.star?.update(controllerStarModel(context));
  else if (state.mode === 'local-space' && state.localSpace) {
    state.localSpace.tick(deltaSeconds);
    const localSnapshot = state.localSpace.getSnapshot();
    context.audio.updatePlayerRcs(
      state.activeShip.sprite.hardpoints,
      localSnapshot.instance.ship,
      performance.now() / 1000
    );
    state.localNpcMining?.tick(deltaSeconds);
    state.panels.local?.update(controllerLocalModel(context));
  } else if (state.mode === 'salvage-space') {
    state.salvageScene?.tick(deltaSeconds);
  }
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
    selectedNpcId: null,
    localSpaceSeed: 0,
    salvageSpaceSeed: 0,
    visitCounter: 0,
    previousLocationId: options.navigation.getSnapshot().currentLocationId,
  };
  const systemLog = createControllerLog();
  const economy = createControllerEconomy(options.navigation);
  const crew = createCrewRosterService();
  const loadouts = createShipLoadoutService();
  let context: ControllerRuntimeContext;
  const engagements = createStarMapEngagementService({
    navigation: options.navigation,
    sectorNpcs: economy.sectorNpcs,
    getPlayerShip: () => state.activeShip,
    getPlayerCombatant: () => controllerPlayerCombatant(context),
    log: (message) => systemLog.write(message),
  });
  context = {
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
  mountControllerStarMap(context);
  return {
    tick(deltaSeconds) {
      tickController(context, deltaSeconds);
    },
  };
}
