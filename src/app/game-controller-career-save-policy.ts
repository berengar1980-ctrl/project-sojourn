import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { hasControllerActiveFieldFleet } from './game-controller-field-world-bridge';

/**
 * A career save must not capture an active player encounter or an uncheckpointed
 * fleet world. Loading a previously stored checkpoint remains independent of
 * this policy, including while the current player is fighting.
 */
export function controllerCareerSaveBlockReason(
  context: ControllerRuntimeContext
): string | null {
  const { state, navigation, engagements, fuelJourney } = context;
  if (
    engagements.activePlayerCombat() ||
    state.embeddedCombat !== null ||
    state.mode === 'combat' ||
    state.combatResultPending
  ) {
    return 'Speichern während eines Gefechts oder vor dessen Abschluss ist nicht möglich.';
  }
  if (hasControllerActiveFieldFleet(context)) {
    // FC-36 does not serialize in-progress multi-ship combat and its loot ledger.
    // Until safe NPC-only fleet checkpoints exist, a live lease blocks ALL saves.
    return 'Speichern während eines laufenden FleetCombat-Gefechts ist nicht möglich.';
  }
  if (!['star-map', 'port'].includes(state.mode) ||
      navigation.getSnapshot().isTravelling ||
      fuelJourney.plan()) {
    return 'Speichern ist derzeit nur im ruhenden Orbit oder Hafen möglich.';
  }
  return null;
}
