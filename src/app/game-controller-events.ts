import type { WorldLocation } from '../core/world-types';
import { createCrewBoardingEncounter } from '../systems/boarding/crew-boarding-adapter';
import { resolveShipRuntimeSetup } from '../systems/ships';
import { createBoardingTacticalPanel } from '../ui/boarding/boarding-tactical-panel';
import { runSceneZoomTransition } from '../ui/scene-transition';
import type { ControllerPanels, ControllerRuntimeContext } from './game-controller-runtime-types';

export interface ControllerEventActions {
  readonly mountStarMap: () => void;
  readonly mountSalvage: (reuseSeed?: boolean) => void;
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

export function advanceEconomyTime(context: ControllerRuntimeContext, deltaSeconds: number): void {
  const elapsed = (controllerDayElapsed.get(context) ?? 0) + Math.max(0, deltaSeconds);
  const days = Math.floor(elapsed / WORLD_DAY_SECONDS);
  controllerDayElapsed.set(context, elapsed - days * WORLD_DAY_SECONDS);
  for (let i = 0; i < days; i += 1) advanceEconomyDay(context);
}

export function advanceEconomyDay(context: ControllerRuntimeContext): void {
  const economy = context.economy;
  economy.situations.advanceNextDay();
  economy.simulation.advanceNextDay();
  economy.npcs.advanceNextDay();
  economy.marketIntel.recordHistory(economy.situations.currentDay);
  economy.salvageEvents.advanceDay(
    economy.situations.currentDay,
    context.navigation.getSnapshot().currentPosition,
    true
  );
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
  if (context.crew.list().length === 0) {
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
    onFinish: (snapshot) => {
      const victory = snapshot.outcome === 'player_win';
      const result = economy.salvageEvents.resolveBoarding(eventId, victory);
      context.systemLog.write('BOARDING > ' + (result?.text ?? 'ENTERKAMPF BEENDET').toUpperCase());
      runSceneZoomTransition(context.root, actions.mountStarMap);
    },
  });
  state.shipSwitcher?.destroy();
  state.shipSwitcher = null;
}

export function controllerSalvageEventCallbacks(
  context: ControllerRuntimeContext,
  actions: ControllerEventActions
) {
  const { state, economy } = context;
  return {
    onDiagnoseDistress: (eventId: string) => {
      const result = economy.salvageEvents.diagnoseDistress(eventId);
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      actions.mountSalvage(true);
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
      if (result?.success) {
        runSceneZoomTransition(context.root, actions.mountStarMap);
      } else {
        actions.mountSalvage(true);
      }
    },
    onTowDistress: (eventId: string) => {
      const result = economy.salvageEvents.towDistress(eventId);
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      runSceneZoomTransition(context.root, actions.mountStarMap);
    },
    onEvacuateDistress: (eventId: string) => {
      const result = economy.salvageEvents.evacuateDistress(eventId);
      if (result) context.systemLog.write('NOTRUF > ' + result.text.toUpperCase());
      if (result?.boardingRequired) {
        context.systemLog.write('BOARDING > HINTERHALT ERKANNT · ENTERKAMPF');
        runSceneZoomTransition(context.root, () =>
          mountControllerBoarding(context, eventId, actions)
        );
      } else if (result?.salvageRights) {
        state.salvageEventFields.delete(eventId);
        actions.mountSalvage(true);
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
