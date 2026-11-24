import { createSettingsMenu } from '../ui/settings/settings-menu';
import type { SectorNpcState } from '../core/npc-types';
import { registerSecurityDroneCombatants } from './game-controller-economy';
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
  // Older Career saves contain mining drones but no salvage drone defender.
  const activeNpcs = context.economy.sectorNpcs.npcs as SectorNpcState[];
  if (saved) registerSecurityDroneCombatants(activeNpcs);
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
  const exercise = options.fieldExercise;
  fieldWorldFor(
    context,
    exercise?.mining,
    exercise?.mining?.sourceLocationId ?? exercise?.salvage?.sourceLocationId
  );
  if (!saved) {
    context.economy.salvageEvents.advanceDay(
      context.economy.situations.currentDay,
      context.navigation.getSnapshot().currentPosition,
      context.state.activeShip.role === 'salvage'
    );
  }
}

function assertCareerOutsideCombat(context: ControllerRuntimeContext): void {
  const mode = context.state.mode;
  if (mode === 'combat' || mode === 'boarding' || context.engagements.activePlayerCombat()) {
    throw new Error('Speichern und Laden sind während eines Gefechts nicht möglich.');
  }
}

export function saveControllerCareer(context: ControllerRuntimeContext): void {
  assertCareerOutsideCombat(context);
  const { state, navigation, fuelJourney, systemLog } = context;
  if (
    !['star-map', 'port'].includes(state.mode) ||
    navigation.getSnapshot().isTravelling ||
    fuelJourney.plan()
  ) {
    throw new Error('Speichern ist derzeit nur im ruhenden Orbit oder Hafen möglich.');
  }
  createCareerSaveStore(window.localStorage).save(captureControllerCareer(context));
  systemLog.write('KARRIERE > SPIELSTAND GESPEICHERT');
}

/** Remember player-visible mining mutations when returning to orbital scenes. */
export function rememberMiningField(context: ControllerRuntimeContext): void {
  const field = context.state.localSpace?.getSnapshot().instance;
  if (field) {
    context.economy.asteroidClaims.rememberField(field.sourceLocationId, field.asteroids);
  }
}

export function controllerSettings(
  context: ControllerRuntimeContext,
  options: GameControllerOptions
) {
  return createSettingsMenu(
    context.audio,
    options.onReturnToMainMenu,
    context.state.playerProfile,
    options.fieldExercise ? undefined : () => saveControllerCareer(context),
    options.onLoadCareer &&
      (() => {
        assertCareerOutsideCombat(context);
        options.onLoadCareer?.();
      })
  );
}
