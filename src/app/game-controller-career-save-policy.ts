import type { ControllerRuntimeContext, SceneMode } from './game-controller-runtime-types';
import { hasControllerActiveFieldFleet } from './game-controller-field-world-bridge';

export interface CareerSaveSafetyState {
  readonly mode: SceneMode;
  readonly playerCombatActive: boolean;
  readonly embeddedCombatActive: boolean;
  readonly combatResultPending: boolean;
  readonly activeFieldFleet: boolean;
  readonly travelling: boolean;
  readonly fuelJourneyActive: boolean;
}

/** Career saves never contain unfinished player combat or uncheckpointed FleetCombat. */
export function careerSaveBlockReason(state: CareerSaveSafetyState): string | null {
  if (
    state.playerCombatActive ||
    state.embeddedCombatActive ||
    state.mode === 'combat' ||
    state.combatResultPending
  ) {
    return 'Speichern während eines Gefechts oder vor dessen Abschluss ist nicht möglich.';
  }
  if (state.activeFieldFleet) {
    // Native NPC 1vs1 encounters retain their existing checkpoint rules.
    // An active FleetCombat lease cannot yet save its ongoing damage/loot ledger.
    return 'Speichern während eines laufenden FleetCombat-Gefechts ist nicht möglich.';
  }
  if (
    !['star-map', 'port'].includes(state.mode) ||
    state.travelling ||
    state.fuelJourneyActive
  ) {
    return 'Speichern ist derzeit nur im ruhenden Orbit oder Hafen möglich.';
  }
  return null;
}

/** Loading the previous valid career slot intentionally has no combat guard. */
export function controllerCareerSaveBlockReason(
  context: ControllerRuntimeContext
): string | null {
  const { state, navigation, engagements, fuelJourney } = context;
  return careerSaveBlockReason({
    mode: state.mode,
    playerCombatActive: Boolean(engagements.activePlayerCombat()),
    embeddedCombatActive: state.embeddedCombat !== null,
    combatResultPending: state.combatResultPending,
    activeFieldFleet: hasControllerActiveFieldFleet(context),
    travelling: navigation.getSnapshot().isTravelling,
    fuelJourneyActive: Boolean(fuelJourney.plan()),
  });
}
