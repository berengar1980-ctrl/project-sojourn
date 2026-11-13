import type { DistressActionResult, SalvageField } from '../core/salvage-types';
import { HIDDEN_HOLD_INTEL_DAY } from '../systems/economy/smuggling-service';
import { showUnderworldContactNotice } from '../ui/customs/underworld-contact-notice';
import type { WorldLocation } from '../core/world-types';
import {
  createCrewBoardingEncounter,
  crewBoardingUnits,
} from '../systems/boarding/crew-boarding-adapter';
import { resolveShipRuntimeSetup } from '../systems/ships';
import {
  wreckCanBoard,
  boardingMapForWreck,
  boardingBriefingForWreck,
  wreckDefenderCount,
  recordWreckBoardingOutcome,
} from '../systems/salvage/salvage-boarding-rules';
import { boardingAfterAction } from '../systems/boarding/boarding-afteraction';
import { createBoardingTacticalPanel } from '../ui/boarding/boarding-tactical-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import type { ControllerPanels, ControllerRuntimeContext } from './game-controller-runtime-types';

export interface ControllerEventActions {
  readonly mountStarMap: () => void;
  readonly mountSalvage?: (field: SalvageField) => void;
}

function showDistressReward(context: ControllerRuntimeContext, result: DistressActionResult): void {
  if (result.rewardCredits <= 0) return;
  const notification = document.createElement('div');
  notification.setAttribute('role', 'status');
  notification.className = 'distress-reward-notice';
  notification.textContent =
    'NOTRUF ABGESCHLOSSEN · BELOHNUNG: +' +
    result.rewardCredits.toLocaleString('de-DE') +
    ' Credits' +
    (result.workHours > 0 ? ' · Einsatzzeit: ' + result.workHours + ' h' : '');
  Object.assign(notification.style, {
    position: 'fixed',
    left: '50%',
    top: '14%',
    transform: 'translateX(-50%)',
    zIndex: '900',
    padding: '18px 24px',
    background: 'rgba(10, 30, 40, 0.96)',
    border: '1px solid #69d8eb',
    borderRadius: '8px',
    color: '#c4f9ff',
    fontWeight: '700',
    textAlign: 'center',
    pointerEvents: 'none',
  });
  context.root.ownerDocument.body.append(notification);
  setTimeout(() => notification.remove(), 6500);
}

function applyDistressOutcome(
  context: ControllerRuntimeContext,
  result: DistressActionResult | null
): void {
  if (!result) return;
  if (result.rewardCredits > 0) {
    context.economy.trade.player.credits += result.rewardCredits;
    showDistressReward(context, result);
    context.systemLog.write(
      'NOTRUF > BELOHNUNG +' + result.rewardCredits.toLocaleString('de-DE') + ' CR'
    );
  }
  if (result.workHours > 0) {
    context.systemLog.write(
      'NOTRUF > EINSATZZEIT ' + result.workHours.toLocaleString('de-DE') + ' h'
    );
  }
}

export function destroyScenePanels(panels: ControllerPanels): void {
  panels.star?.destroy();
  panels.local?.destroy();
  panels.port?.destroy();
  panels.star = null;
  panels.local = null;
  panels.port = null;
}

export function destroyControllerCombat(context: ControllerRuntimeContext): void {
  context.state.combatPanel?.destroy();
  context.state.combatPanel = null;
}

export function destroyControllerSalvage(context: ControllerRuntimeContext): void {
  context.state.salvageScene?.destroy();
  context.state.salvageScene = null;
}

export function destroyControllerBoarding(context: ControllerRuntimeContext): void {
  context.state.boardingPanel?.destroy();
  context.state.boardingPanel = null;
}

export function destroyGameController(
  context: ControllerRuntimeContext,
  settingsMenu: { destroy(): void }
): void {
  const { state } = context;
  settingsMenu.destroy();
  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
  context.audio.destroy();
  context.root.replaceChildren();
}

export function sectorEventLocation(
  context: ControllerRuntimeContext,
  id: string | null
): WorldLocation | null {
  const event = context.economy.salvageEvents.event(id);
  if (!event) return null;
  return {
    id: event.id,
    name: event.title,
    kind: 'wreck',
    position: event.position,
    radius: event.type === 'distress-rescue' ? 12 : 9,
    description: event.description,
    activities: { salvage: true, missions: event.type === 'distress-rescue' },
    dangerLevel: event.type === 'distress-rescue' && event.distressTrap ? 2 : 1,
  };
}

const WORLD_DAY_SECONDS = 180;
const controllerDayElapsed = new WeakMap<ControllerRuntimeContext, number>();

export function tickEconomy(context: ControllerRuntimeContext, dt: number): void {
  const elapsed = (controllerDayElapsed.get(context) ?? 0) + Math.max(0, dt);
  const days = Math.floor(elapsed / WORLD_DAY_SECONDS);
  controllerDayElapsed.set(context, elapsed - days * WORLD_DAY_SECONDS);
  for (let i = 0; i < days; i += 1) advanceEconomyDay(context);
}

export function advanceEconomyDay(context: ControllerRuntimeContext): void {
  const economy = context.economy;
  economy.situations.advanceNextDay();
  economy.blockades.advanceDay(economy.situations.currentDay);
  economy.concessions.advanceDay(economy.situations.currentDay);
  economy.patrol.advanceDay(economy.situations.currentDay);
  economy.simulation.advanceNextDay();
  economy.npcs.advanceNextDay();
  economy.sectorNpcs.advanceDay(economy.situations.currentDay);
  economy.npcSmuggling.advanceDay(economy.situations.currentDay);
  if (
    economy.situations.currentDay >= HIDDEN_HOLD_INTEL_DAY &&
    !economy.smuggling.state.hiddenHoldIntelContacted &&
    !economy.smuggling.state.hiddenHoldIntel
  ) {
    economy.smuggling.state.hiddenHoldIntelContacted = true;
    context.systemLog.write(
      'UNTERDECK > VERSCHLÜSSELTE NACHRICHT · INFORMANT BIETET VERDECKTEN FRACHTRAUM AN'
    );
    showUnderworldContactNotice(context.root);
  }
  economy.marketIntel.recordHistory(economy.situations.currentDay);
  const before = new Set(economy.salvageEvents.playerVisible.map((event) => event.id));
  economy.salvageEvents.advanceDay(
    economy.situations.currentDay,
    context.navigation.getSnapshot().currentPosition,
    context.state.activeShip.role === 'salvage'
  );
  for (const event of economy.salvageEvents.playerVisible) {
    if (!before.has(event.id))
      context.systemLog.write(
        'SEKTOR-EVENT > ' + event.title.toUpperCase() + ' · STERNKARTE · 3 TAGE EXKLUSIV'
      );
  }
}

export function completeDistressTowOnArrival(
  context: ControllerRuntimeContext,
  currentLocationId: string | null
): void {
  const result = context.economy.salvageEvents.finishTowAtLocation(currentLocationId);
  if (!result) return;
  context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
  applyDistressOutcome(context, result);
}

export function mountControllerBoarding(
  context: ControllerRuntimeContext,
  eventId: string,
  actions: ControllerEventActions
): void {
  const { state, economy } = context;
  const event = economy.salvageEvents.event(eventId);
  if (!event) {
    actions.mountStarMap();
    return;
  }
  if (crewBoardingUnits(context.crew).length === 0) {
    economy.salvageEvents.resolveBoarding(eventId, false);
    context.systemLog.write('BOARDING > KEIN EINSATZFÄHIGES ENTERTEAM');
    actions.mountStarMap();
    return;
  }

  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  state.mode = 'boarding';
  context.audio.clearPlayerRcs();

  const enemyCount = 2 + (event.fieldSeed % 2);
  const encounter = createCrewBoardingEncounter({
    roster: context.crew,
    seed: event.fieldSeed ^ 0x0b0a4d,
    enemyUnits: Array.from({ length: enemyCount }, (_, index) => ({
      id: `distress-raider-${index + 1}`,
      name: `Plünderer ${index + 1}`,
      team: 'enemy' as const,
      hp: 9,
      maxHp: 9,
      armor: 2,
      rangedSkill: 48 + index * 4,
      meleeSkill: 46 + index * 5,
    })),
  });
  state.boardingPanel = createBoardingTacticalPanel({
    root: context.root,
    encounter,
    missionTitle: event.title,
    missionBriefing: 'Notruf-Falle · feindliche Entertrupps am Havaristen.',
    onFinish: (snapshot) => {
      const aftermath = boardingAfterAction(snapshot, 'distress');
      context.systemLog.write(aftermath.report);
      const victory = snapshot.outcome === 'player_win';
      const result = economy.salvageEvents.resolveBoarding(eventId, victory);
      context.systemLog.write('BOARDING > ' + (result?.text ?? 'ENTERKAMPF BEENDET').toUpperCase());
      applyDistressOutcome(context, result);
      context.campaignEvents.emit(aftermath.event);
      runSceneZoomTransition(context.root, actions.mountStarMap);
    },
  });
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
}

export function mountControllerWreckBoarding(
  context: ControllerRuntimeContext,
  wreckId: string,
  returnToSalvage: (field: SalvageField) => void
): void {
  const { state } = context;
  const field = state.salvageScene?.getField();
  const wreck = field?.wrecks.find((entry) => entry.id === wreckId);
  if (!field || !wreck || !wreckCanBoard(wreck) || crewBoardingUnits(context.crew).length === 0) {
    context.systemLog.write('BOARDING > WRACK NICHT ENTERBAR ODER KEIN EINSATZFÄHIGER TRUPP');
    return;
  }

  destroyScenePanels(state.panels);
  destroyControllerSalvage(context);
  destroyControllerCombat(context);
  destroyControllerBoarding(context);
  state.localSpace = null;
  state.localNpcMining = null;
  state.mode = 'boarding';
  context.audio.clearPlayerRcs();
  const seed = field.seed ^ (wreck.effectSeed ?? wreck.id.length) ^ 0x574245;
  const encounter = createCrewBoardingEncounter({
    roster: context.crew,
    seed,
    mapId: boardingMapForWreck(wreck),
    enemyUnits: Array.from({ length: wreckDefenderCount(wreck) }, (_, index) => ({
      id: 'wreck-guard-' + index,
      name: 'Wrackbesetzer ' + (index + 1),
      team: 'enemy' as const,
      hp: 9,
      maxHp: 9,
      armor: 1 + (index % 2),
      rangedSkill: 46 + index * 4,
      meleeSkill: 45 + index * 4,
    })),
  });
  context.systemLog.write('BOARDING > ENTERTRUPP IM WRACK ' + wreck.name.toUpperCase());
  state.boardingPanel = createBoardingTacticalPanel({
    root: context.root,
    encounter,
    missionTitle: wreck.name,
    missionBriefing: boardingBriefingForWreck(wreck),
    onFinish: (snapshot) => {
      const aftermath = boardingAfterAction(snapshot, 'wreck', wreck.id);
      const consequences = recordWreckBoardingOutcome(wreck, snapshot);
      context.systemLog.write(aftermath.report);
      context.systemLog.write(
        'BOARDING > WRACK · ' +
          consequences.defeated +
          ' VERTEIDIGER AUSGESCHALTET · ' +
          consequences.remaining +
          ' VERBLEIBEN · VERSUCH ' +
          wreck.boardingAttempts
      );
      if (snapshot.outcome === 'player_win') {
        wreck.boardingCleared = true;
        context.systemLog.write('BOARDING > DECKS GESICHERT · BERGUNG FREIGEGEBEN');
      } else {
        context.systemLog.write('BOARDING > WRACKEINSATZ ' + snapshot.outcome.toUpperCase());
      }
      context.campaignEvents.emit(aftermath.event);
      runSceneZoomTransition(context.root, () => returnToSalvage(field));
    },
  });
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
}

export function controllerSalvageExitAction(
  context: ControllerRuntimeContext,
  mountStarMap: () => void
): () => void {
  return () => {
    const event = context.economy.salvageEvents.event(
      context.navigation.getSnapshot().currentLocationId
    );
    if (event?.distressStage === 'towing' && event.distressTowDestinationId) {
      context.navigation.selectDestination(event.distressTowDestinationId);
      context.navigation.startTravel();
      context.systemLog.write('SCHLEPPEN > KARTENAUSGANG ERREICHT · TRANSFER ZUR WERFT');
    }
    runSceneZoomTransition(context.root, mountStarMap);
  };
}

export function controllerSalvageEventCallbacks(
  context: ControllerRuntimeContext,
  actions: ControllerEventActions
) {
  const { state, economy } = context;
  return {
    onBoardWreck: (wreckId: string) => {
      if (actions.mountSalvage) {
        mountControllerWreckBoarding(context, wreckId, actions.mountSalvage);
      }
    },
    onDiagnoseDistress: (eventId: string) => {
      const runtime = resolveShipRuntimeSetup(state.activeShip, {
        ...context.crew.runtimeOptions(state.activeShip),
        installed: context.loadouts.get(state.activeShip),
      });
      const result = economy.salvageEvents.diagnoseDistress(
        eventId,
        Math.round(runtime.stationSkills.engineering)
      );
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      applyDistressOutcome(context, result);
      if (result?.boardingRequired) {
        context.systemLog.write('BOARDING > NOTRUFFALLE ERKANNT · ENTERKAMPF');
        runSceneZoomTransition(context.root, () =>
          mountControllerBoarding(context, eventId, actions)
        );
      } else {
        state.salvageScene?.updateSectorEvent(economy.salvageEvents.event(eventId));
      }
    },
    onRepairDistress: (eventId: string) => {
      const runtime = resolveShipRuntimeSetup(state.activeShip, {
        ...context.crew.runtimeOptions(state.activeShip),
        installed: context.loadouts.get(state.activeShip),
      });
      const result = economy.salvageEvents.repairDistress(
        eventId,
        Math.round(runtime.stationSkills.engineering)
      );
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      applyDistressOutcome(context, result);
      if (result?.success) {
        state.salvageScene?.beginDistressRepair();
        setTimeout(() => runSceneZoomTransition(context.root, actions.mountStarMap), 5500);
      } else {
        state.salvageScene?.updateSectorEvent(economy.salvageEvents.event(eventId));
      }
    },
    onTowDistress: (eventId: string) => {
      if (!state.salvageScene?.canAttachDistressTow()) {
        context.systemLog.write('SCHLEPPEN > GREIFHAKEN AUSSER REICHWEITE · HAVARIST ANFLIEGEN');
        return;
      }
      const result = economy.salvageEvents.towDistress(eventId);
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      if (!result?.success || !result.towDestinationId) return;
      context.systemLog.write('SCHLEPPEN > MANUELL ZUM MARKIERTEN AUSGANG FLIEGEN');
      const event = economy.salvageEvents.event(eventId);
      if (event) {
        state.salvageScene?.updateSectorEvent(event);
        state.salvageScene?.beginDistressTow(event);
      }
    },
    onEvacuateDistress: (eventId: string) => {
      const result = economy.salvageEvents.evacuateDistress(eventId);
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      applyDistressOutcome(context, result);
      if (result?.boardingRequired) {
        context.systemLog.write('BOARDING > HINTERHALT ERKANNT · ENTERKAMPF');
        runSceneZoomTransition(context.root, () =>
          mountControllerBoarding(context, eventId, actions)
        );
      } else if (result?.salvageRights) {
        state.salvageScene?.updateSectorEvent(economy.salvageEvents.event(eventId));
      } else if (result?.success) {
        runSceneZoomTransition(context.root, actions.mountStarMap);
      }
    },
    onSectorEventResolved: (eventId: string) => {
      economy.salvageEvents.resolve(eventId);
      state.salvageEventFields.delete(eventId);
      context.systemLog.write('BERGUNG > SECTOR-EVENT ABGESCHLOSSEN');
    },
  };
}
