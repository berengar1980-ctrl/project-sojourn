import { validateControllerRestore } from './game-controller-types';
import { tickControllerNpcOperations } from './game-controller-npc-tick';
import {
  advanceControllerFieldWorld,
  fieldEngagementHooks,
  fieldWorldFor,
} from './game-controller-field-world-bridge';
import {
  inspectLegalDockArrival,
  reportLegalDeparture,
  reportLegalOrbitalArrival,
  advanceNpcPenalCustody,
} from './game-controller-law-enforcement';
import { observeControllerOperations, operationsCombatHooks } from './game-controller-operations';
import { startPlayerMiningCombat } from './game-controller-mining-combat-action';
import { toggleControllerAsteroidClaim } from './game-controller-claim-actions';
import { resolveControllerCombat } from './game-controller-combat-resolution';
import { recordCareerCombatWrecks } from './game-controller-combat-wrecks';
import { fieldWithCareerCombatWrecks } from './game-controller-combat-salvage-field';
import { skipControllerTickForCombatResult } from './game-controller-combat-result-guard';
import type { SalvageField } from '../core/salvage-types';
import { snapshotPlayerProfile, withPlayerShipName } from '../core/player-profile';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import { createGameAudioService } from '../systems/audio/game-audio-service';
import { createCrewRosterService } from '../systems/crew';
import { createStarMapEngagementService } from '../systems/combat';
import { createShipLoadoutService } from '../systems/ships';
import { createShipOperatingService } from '../systems/ships/ship-operating-costs';
import { createFuelJourneyService } from './game-controller-fuel-journey';
import { createLocalSpacePanel } from '../ui/local-space/local-space-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import { createControllerEconomy } from './game-controller-economy';
import { controllerEconomyFromCareer } from './game-controller-career-economy';
import { captureControllerCareer } from './game-controller-career-capture';
import {
  installControllerCareer,
  controllerSettings,
  rememberMiningField,
} from './game-controller-career-install';
import { createInitialControllerState } from './game-controller-initial-state';
import { narrowsSector } from '../data/maps/narrows-sector';
import type { WorldMap } from '../core/world-types';
import { inspectDockArrival, inspectPatrolTravel } from './game-controller-customs';
import { createControllerCampaignServicesWithActions } from './game-controller-campaign-setup';
import { createCampaignNavigationTracker } from './game-controller-campaign-events';
import { tickControllerScene } from './game-controller-scene-tick';
import { mountControllerShipSwitcher } from './game-controller-switcher-bridge';
import { createControllerStarPanel } from './game-controller-star-map';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
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
import { createControllerLocalActions } from './game-controller-local-actions';
import { handleControllerLocationEntry } from './game-controller-location-entry';
import { miningLocationById, salvageLocationById } from './game-controller-local-model';
import { ensureMiningCombatWorld } from './game-controller-mining-runtime';
import { createActivePortPanel } from './game-controller-port';
import { createSalvageScene } from './game-controller-salvage';
import { salvageSecurityActions } from './game-controller-salvage-security-actions';
import {
  controllerLocalModel,
  controllerShipRuntimeOptions,
  controllerStarModel,
  createControllerLog,
  localSeed,
  syncControllerNavigationCrewPerformance,
  updateSectorNavigationThreats,
} from './game-controller-models';
import type { GameControllerOptions, GameController } from './game-controller-types';
import {
  startPlayerFuelTravel,
  tickPlayerFuelJourney,
  refuelAtPort,
  servicedPlayerCombatant,
} from './game-controller-ship-service';
export type { GameController } from './game-controller-types';
function mountControllerSwitcher(context: ControllerRuntimeContext): void {
  mountControllerShipSwitcher(context, (mode) => {
    if (mode === 'local-space') mountControllerMining(context, true);
    else if (mode === 'salvage-space') mountControllerSalvage(context, true);
    else if (mode === 'port') mountControllerPort(context, false);
    else mountControllerStarMap(context);
  });
}

function mountControllerStarMap(context: ControllerRuntimeContext): void {
  const { state } = context;
  rememberMiningField(context);
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  state.embeddedCombat = null;
  state.mode = 'star-map';
  state.displayedWorldId = context.world.world().id;
  syncControllerNavigationCrewPerformance(context);
  context.audio.clearPlayerRcs();
  state.panels.star = createControllerStarPanel({
    ...context,
    world: () => context.world.world(),
    exitLocationId: () => context.world.exitLocationId(),
    returnFromCampaignSystem: () => context.world.returnFromSystem(),
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
    startFuelTravel: () => {
      const before = context.navigation.getSnapshot();
      const started = startPlayerFuelTravel(context);
      if (started) {
        reportLegalDeparture(
          context,
          before.currentLocationId,
          context.navigation.getSnapshot().destinationId
        );
      }
      return started;
    },
    onRouteSelectionChanged: () => context.fuelJourney.cancel(),
    eventById: (id) =>
      context.world.inForeignSystem()
        ? null
        : (context.economy.salvageEvents.playerVisible.find((event) => event.id === id) ?? null),
    onAcceptEvent: (id) => context.economy.salvageEvents.acceptForPlayer(id),
  });
  mountControllerSwitcher(context);
}
function mountControllerPort(context: ControllerRuntimeContext, announce = true): void {
  const { state, economy } = context;
  rememberMiningField(context);
  const locationId = context.navigation.getSnapshot().currentLocationId;
  if (announce) inspectLegalDockArrival(context);
  refuelAtPort(context);
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
    state.shipOwnership,
    (nextShip) => {
      context.crew.transferAssignments(state.activeShip, nextShip);
      state.activeShip = withPlayerShipName(nextShip, state.playerProfile, state.starterShipId);
      economy.legal.registerShip(state.activeShip.id, 'player');
      context.economy.salvageEvents.setPlayerSalvageEligible(nextShip.role === 'salvage');
      mountControllerPort(context, false);
    },
    context.shipOperations,
    economy.smuggling,
    economy.charters,
    economy.legal
  );
  if (!state.panels.port) return;
  state.mode = 'port';
  context.audio.clearPlayerRcs();
  if (announce) context.systemLog.write('DOCK > ' + (locationId ?? 'UNKNOWN').toUpperCase());
  if (announce) inspectDockArrival(context);
  mountControllerSwitcher(context);
}
function mountControllerMining(
  context: ControllerRuntimeContext,
  reuseSeed = false,
  preserveField = false
): void {
  const { state } = context;
  const site = context.navigation.getSnapshot().currentLocationId;
  if (
    !preserveField &&
    site &&
    state.activeShip.role === 'salvage' &&
    fieldWorldFor(context)
      .combatWrecks(site)
      .some((wreck) => wreck.resources.some((resource) => resource.remainingAmount > 0))
  )
    return mountControllerSalvage(context, reuseSeed);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  destroyScenePanels(state.panels);
  state.mode = 'local-space';
  state.embeddedCombat = null;
  const location = miningLocationById(context.navigation.getSnapshot().currentLocationId);
  if (!location) return mountControllerStarMap(context);
  if (!preserveField) rememberMiningField(context);
  if (!reuseSeed || state.localSpaceSeed === 0) {
    state.localSpaceSeed = context.economy.asteroidClaims.seedFor(location.id, () =>
      localSeed((state.visitCounter += 1))
    );
  }
  ensureMiningCombatWorld(context, location, preserveField);
  if (state.selectedClaimTarget?.locationId === location.id)
    state.localSpace?.selectAsteroid(state.selectedClaimTarget.asteroidId);
  context.systemLog.write(
    reuseSeed ? 'TEST > SCHIFFSWECHSEL' : 'LOCAL OPS > ' + location.name.toUpperCase()
  );
  state.panels.local = createLocalSpacePanel({
    root: context.root,
    model: controllerLocalModel(context),
    log: context.systemLog,
    ...createControllerLocalActions(context, () => mountControllerStarMap(context)),
    onToggleAsteroidClaim: () => toggleControllerAsteroidClaim(context),
    onSelectNpc: (id) => {
      state.selectedNpcId = id;
      state.panels.local?.update(controllerLocalModel(context));
    },
    onAttackNpc: (id) => startPlayerMiningCombat(context, id),
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
  const combatWrecks = currentLocationId
    ? fieldWorldFor(context).combatWrecks(currentLocationId)
    : [];
  const wreckLocation =
    state.activeShip.role === 'salvage' && combatWrecks.length > 0
      ? narrowsSector.locations.find((entry) => entry.id === currentLocationId)
      : undefined;
  const location =
    salvageLocationById(currentLocationId) ??
    wreckLocation ??
    sectorEventLocation(context, currentLocationId);
  if (!location) return mountControllerStarMap(context);
  state.mode = 'salvage-space';
  state.embeddedCombat = null;
  if (!reuseSeed || state.salvageSpaceSeed === 0)
    state.salvageSpaceSeed = localSeed((state.visitCounter += 1));
  const sceneSeed = economy.wreckClaims.seedFor(
    location.id,
    sectorEvent?.fieldSeed ?? state.salvageSpaceSeed
  );
  const sceneField = fieldWithCareerCombatWrecks(
    context,
    location,
    sceneSeed,
    preservedField,
    sectorEvent
  );
  state.salvageScene = createSalvageScene({
    root: context.root,
    ship: state.activeShip,
    seed: sceneSeed,
    location,
    ...(sceneField ? { field: sceneField } : {}),
    ...(sectorEvent ? { sectorEvent } : {}),
    onLeaveField: (field) =>
      fieldWorldFor(context).reconcileCombatWrecks(field.sourceLocationId, field.wrecks),
    economy: economy.salvage,
    npcEconomy: economy.npcs,
    sectorNpcs: economy.sectorNpcs.npcs,
    wreckClaims: economy.wreckClaims,
    ...salvageSecurityActions(context),
    getCurrentDay: () => economy.situations.currentDay,
    player: economy.trade.player,
    componentInventory: economy.components,
    runtimeOptions: controllerShipRuntimeOptions(context, state.activeShip),
    log: context.systemLog,
    audio: context.audio,
    selectedNpcId: state.selectedNpcId,
    onSelectNpc: (id) => (state.selectedNpcId = id),
    onAttackNpc: (id, arena, playerInitiated = true) => {
      state.selectedNpcId = id;
      if (context.engagements.engageNpcInArena(id, arena, playerInitiated)) {
        state.embeddedCombat = 'salvage-space';
        context.systemLog.write('COMBAT > GEFECHT IM WRACKFELD');
      }
    },
    getCombat: () =>
      state.embeddedCombat === 'salvage-space'
        ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
        : null,
    isCombatActive: () => state.embeddedCombat === 'salvage-space',
    onCombatBystanders: (bystanders) =>
      (
        context.engagements.activePlayerFleet() ?? context.engagements.activePlayerCombat()
      )?.setBystanders(bystanders),
    onCombatGrapple: () => context.engagements.activePlayerCombat()?.fireGrapple('attacker'),
    onCombatTactic: (tactic) =>
      context.engagements.activePlayerCombat()?.setTactic('attacker', tactic),
    ...controllerSalvageEventCallbacks(context, {
      mountStarMap: () => mountControllerStarMap(context),
      mountSalvage: (field) => mountControllerSalvage(context, true, field),
    }),
    onReturnToStarMap: controllerSalvageExitAction(context, () => mountControllerStarMap(context)),
  });
  if (finalCombat) state.salvageScene?.finishCombat(finalCombat);
  mountControllerSwitcher(context);
}
function tickController(context: ControllerRuntimeContext, deltaSeconds: number): void {
  if (skipControllerTickForCombatResult(context, deltaSeconds)) return;
  const { state, economy } = context;
  economy.salvageEvents.setPlayerSalvageEligible(state.activeShip.role === 'salvage');
  tickControllerNpcOperations(economy, deltaSeconds);
  updateSectorNavigationThreats(context);
  context.engagements.syncPlayerPursuitTarget();
  const navigationBefore = context.navigation.getSnapshot();
  const navigationSnapshot = context.navigation.tick(deltaSeconds);
  const atFuelStop = tickPlayerFuelJourney(context, navigationBefore, navigationSnapshot);
  const afterFuel = context.navigation.getSnapshot();
  if (!navigationBefore.isTravelling && afterFuel.isTravelling)
    reportLegalDeparture(context, navigationBefore.currentLocationId, afterFuel.destinationId);
  context.campaignNavigation.observe(navigationSnapshot);
  inspectPatrolTravel(context, deltaSeconds);
  context.engagements.tick(deltaSeconds);
  advanceControllerFieldWorld(context, deltaSeconds);
  resolveControllerCombat(context, {
    starMap: () => mountControllerStarMap(context),
    mining: (reuseSeed, preserveField) => mountControllerMining(context, reuseSeed, preserveField),
    salvage: (reuseSeed, field, combat) =>
      mountControllerSalvage(context, reuseSeed, field, combat),
  });
  const currentLocationId = navigationSnapshot.currentLocationId;
  observeControllerOperations(context, deltaSeconds);
  if (!navigationSnapshot.isTravelling && state.previousLocationId !== currentLocationId) {
    reportLegalOrbitalArrival(context, currentLocationId);
    if (!atFuelStop) completeDistressTowOnArrival(context, currentLocationId);
  }
  if (!atFuelStop) {
    handleControllerLocationEntry(
      context,
      currentLocationId,
      () => mountControllerMining(context),
      () => mountControllerSalvage(context)
    );
  }
  const dayBeforeEconomy = economy.situations.currentDay;
  tickEconomy(context, deltaSeconds);
  if (economy.situations.currentDay !== dayBeforeEconomy) advanceNpcPenalCustody(context);
  state.previousLocationId = currentLocationId;
  state.shipSwitcher?.update(state.activeShip.id, navigationSnapshot.isTravelling);
  tickControllerScene(context, deltaSeconds);
  if (state.mode === 'star-map' && state.displayedWorldId !== context.world.world().id) {
    mountControllerStarMap(context);
  }
}

function mountInitialScene(context: ControllerRuntimeContext, options: GameControllerOptions) {
  if (options.fieldExercise) {
    options.fieldExercise.prepare(context);
    if (options.fieldExercise.salvage)
      mountControllerSalvage(context, true, options.fieldExercise.salvage);
    else mountControllerMining(context);
  } else mountControllerStarMap(context);
}
export function createGameController(options: GameControllerOptions): GameController {
  const saved = options.restoredSession;
  validateControllerRestore(options);
  const systemLog = createControllerLog();
  const log = (message: string) => systemLog.write(message);
  const economy = saved
    ? controllerEconomyFromCareer(saved, log)
    : createControllerEconomy(options.navigation, log, undefined, options.fieldExercise?.npcs);
  if (!saved) economy.smuggling.activateShip(options.ship.id);
  const state = createInitialControllerState(options, economy);

  const crew = saved?.crew ?? createCrewRosterService(state.playerProfile);
  const loadouts = saved?.commerce.ships.loadouts ?? createShipLoadoutService();
  const shipOperations =
    saved?.commerce.ships.operating ?? createShipOperatingService(economy.trade);
  const fuelJourney = createFuelJourneyService();
  let foreignWorld = () => false;
  let engagementWorld: () => WorldMap = () => narrowsSector;
  let combatContext: ControllerRuntimeContext | null = null;
  const engagements = createStarMapEngagementService({
    navigation: options.navigation,
    sectorNpcs: economy.sectorNpcs,
    world: () => engagementWorld(),
    inStarMap: () => state.mode === 'star-map',
    ...fieldEngagementHooks(() => combatContext),
    isPlayerInCampaignSystem: () => foreignWorld(),
    ...operationsCombatHooks(economy),
    onNpcCombatEnded: (snapshot, attacker) => {
      if (combatContext) recordCareerCombatWrecks(combatContext, snapshot, attacker.locationId);
    },
    mayInterceptPlayer: () =>
      state.mode === 'star-map' && !state.combatResultPending && state.combatReengageSeconds <= 0,
    getPlayerShip: () => state.activeShip,
    getPlayerCombatant: () =>
      servicedPlayerCombatant(state.activeShip, crew, loadouts, shipOperations),
    log: (message) => systemLog.write(message),
  });
  if (saved?.combat) {
    engagements.restorePlayerCareerCombat(
      saved.combat,
      saved.combat.exportCareerState().defenderId
    );
  }
  const campaignServices = saved
    ? {
        campaigns: saved.campaigns.campaigns,
        campaignEvents: saved.campaigns.events,
        campaignNavigation: createCampaignNavigationTracker(
          saved.campaigns.events,
          options.navigation.getSnapshot()
        ),
        reputation: saved.society.reputation,
        world: saved.navigationWorld.world,
      }
    : createControllerCampaignServicesWithActions(
        state,
        economy,
        crew,
        loadouts,
        engagements,
        options
      );
  foreignWorld = () => campaignServices.world.inForeignSystem();
  engagementWorld = () => campaignServices.world.world();
  const context: ControllerRuntimeContext = {
    root: options.root,
    navigation: options.navigation,
    systemLog,
    economy,
    crew,
    loadouts,
    shipOperations,
    fuelJourney,
    audio: createGameAudioService(),
    engagements,
    ...campaignServices,
    state,
  };
  combatContext = context;
  installControllerCareer(context, options);
  const menu = controllerSettings(context, options);
  mountInitialScene(context, options);
  return {
    profileSnapshot: () => snapshotPlayerProfile(state.playerProfile),
    careerSnapshot: () => captureControllerCareer(context),
    tick: (deltaSeconds) => tickController(context, deltaSeconds),
    destroy: () => {
      campaignServices.campaigns.destroy();
      destroyGameController(context, menu);
    },
  };
}
