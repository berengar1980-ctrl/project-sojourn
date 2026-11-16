import { tickControllerNpcOperations } from './game-controller-npc-tick';
import {
  advanceControllerFieldWorld,
  fieldWorldFor,
  bindCareerFieldWorld,
} from './game-controller-field-world-bridge';
import {
  registerSectorShips,
  inspectLegalDockArrival,
  reportLegalDeparture,
  reportLegalOrbitalArrival,
  advanceNpcPenalCustody,
  tickLegalDetention,
} from './game-controller-law-enforcement';
import { observeControllerOperations, operationsCombatHooks } from './game-controller-operations';
import { localMiningCombatArena } from './game-controller-combat';
import { toggleControllerAsteroidClaim } from './game-controller-claim-actions';
import { resolveControllerCombat } from './game-controller-combat-resolution';
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
import { createSettingsMenu } from '../ui/settings/settings-menu';
import { createControllerEconomy } from './game-controller-economy';
import { controllerEconomyFromCareer } from './game-controller-career-economy';
import { captureControllerCareer } from './game-controller-career-capture';
import { createInitialControllerState } from './game-controller-initial-state';
import { narrowsSector } from '../data/maps/narrows-sector';
import type { WorldMap } from '../core/world-types';
import { inspectDockArrival, tickCustoms, inspectPatrolTravel } from './game-controller-customs';
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
import { generateSectorSalvageEventField } from '../systems/salvage';
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
function rememberMiningField(context: ControllerRuntimeContext): void {
  const field = context.state.localSpace?.getSnapshot().instance;
  if (field) context.economy.asteroidClaims.rememberField(field.sourceLocationId, field.asteroids);
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
    onAttackNpc: (id) => {
      state.selectedNpcId = id;
      const local = state.localSpace?.getSnapshot();
      const target =
        state.localNpcMining?.ships.find((entry) => entry.npcId === id) ??
        context.economy.localPirates
          .get(local?.instance.sourceLocationId ?? '')
          ?.snapshot(context.economy.sectorNpcs.npcs)
          .find((entry) => entry.npcId === id);
      if (!local || !target) return;
      const arena = localMiningCombatArena(
        local.instance,
        state.localSpace!.getShipWorldVelocity()
      );
      const started = context.engagements.engageNpcInArena(id, {
        ...arena,
        defenderPosition: { ...target.position },
        defenderHeadingRadians: target.headingRadians,
        defenderVelocity: {
          x: Math.cos(target.headingRadians) * target.speed,
          y: Math.sin(target.headingRadians) * target.speed,
        },
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
      ? { field: preservedField, ...(sectorEvent ? { sectorEvent } : {}) }
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
    onSelectNpc: (id) => (state.selectedNpcId = id),
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
      mountSalvage: (field) => mountControllerSalvage(context, true, field),
    }),
    onReturnToStarMap: controllerSalvageExitAction(context, () => mountControllerStarMap(context)),
  });
  if (finalCombat) state.salvageScene?.finishCombat(finalCombat);
  mountControllerSwitcher(context);
}
function tickController(context: ControllerRuntimeContext, deltaSeconds: number): void {
  if (tickLegalDetention(context, deltaSeconds)) return;
  if (tickCustoms(context)) return;
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

export function createGameController(options: GameControllerOptions): GameController {
  const saved = options.restoredSession;
  if (saved && saved.navigationWorld.navigation !== options.navigation) {
    throw new Error('Career navigation must use the staged navigation authority');
  }
  if (saved && saved.commerce.ships.activeShipId !== options.ship.id) {
    throw new Error('Career ship must match the staged active ship');
  }
  const systemLog = createControllerLog();
  const economy = saved
    ? controllerEconomyFromCareer(saved, (message) => systemLog.write(message))
    : createControllerEconomy(options.navigation, (message) => systemLog.write(message));
  if (!saved) economy.smuggling.activateShip(options.ship.id);
  const state = createInitialControllerState(options, economy);

  const crew = saved?.crew ?? createCrewRosterService(state.playerProfile);
  const loadouts = saved?.commerce.ships.loadouts ?? createShipLoadoutService();
  const shipOperations = saved?.commerce.ships.operating ??
    createShipOperatingService(economy.trade);
  const fuelJourney = createFuelJourneyService();
  let foreignWorld = () => false;
  let engagementWorld: () => WorldMap = () => narrowsSector;
  const engagements = createStarMapEngagementService({
    navigation: options.navigation,
    sectorNpcs: economy.sectorNpcs,
    world: () => engagementWorld(),
    isPlayerInCampaignSystem: () => foreignWorld(),
    ...operationsCombatHooks(economy),
    getPlayerShip: () => state.activeShip,
    getPlayerCombatant: () =>
      servicedPlayerCombatant(state.activeShip, crew, loadouts, shipOperations),
    log: (message) => systemLog.write(message),
  });
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
  registerSectorShips(context);
  if (saved) bindCareerFieldWorld(context, saved.fieldsLegal.fields);
  fieldWorldFor(context);
  if (!saved) economy.salvageEvents.advanceDay(
    economy.situations.currentDay,
    options.navigation.getSnapshot().currentPosition,
    state.activeShip.role === 'salvage'
  );
  const menu = createSettingsMenu(context.audio, options.onReturnToMainMenu, state.playerProfile);
  mountControllerStarMap(context);
  return {
    profileSnapshot: () => snapshotPlayerProfile(state.playerProfile),
    careerSnapshot: () => captureControllerCareer(context),
    tick(deltaSeconds) {
      tickController(context, deltaSeconds);
    },
    destroy: () => {
      campaignServices.campaigns.destroy();
      destroyGameController(context, menu);
    },
  };
}
