import { captureCareerCustody } from '../systems/persistence/career-custody-checkpoint';
import { createCareerSaveStore } from '../systems/persistence/career-save-store';
import { captureControllerCareer } from './game-controller-career-capture';
import { bindCareerFieldWorld, fieldWorldFor } from './game-controller-field-world-bridge';
import { registerSectorShips, stageControllerCustody } from './game-controller-law-enforcement';
import { restoreControllerDayElapsed } from './game-controller-events';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { GameControllerOptions } from './game-controller-types';

export function installControllerCareer(
  context: ControllerRuntimeContext,
  options: GameControllerOptions
): void {
  const saved = options.restoredSession;
  registerSectorShips(context);
  if (saved) {
    restoreControllerDayElapsed(context, saved.controllerSecondsIntoDay ?? 0);
    bindCareerFieldWorld(context, saved.fieldsLegal.fields);
    stageControllerCustody(
      context,
      captureCareerCustody(saved.custody.prisoners, saved.custody.player)
    );
    options.onCareerContextReady?.(context);
    saved.activate();
  }
  fieldWorldFor(context);
  if (!saved) {
    context.economy.salvageEvents.advanceDay(
      context.economy.situations.currentDay,
      context.navigation.getSnapshot().currentPosition,
      context.state.activeShip.role === 'salvage'
    );
  }
}

export function saveControllerCareer(context: ControllerRuntimeContext): void {
  const { state, navigation, engagements, fuelJourney, systemLog } = context;
  if (
    !['star-map', 'port'].includes(state.mode) ||
    engagements.activePlayerCombat() ||
    navigation.getSnapshot().isTravelling ||
    fuelJourney.plan()
  ) {
    throw new Error('Speichern ist derzeit nur im ruhenden Orbit oder Hafen möglich.');
  }
  createCareerSaveStore(window.localStorage).save(captureControllerCareer(context));
  systemLog.write('KARRIERE > SPIELSTAND GESPEICHERT');
}

