import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { enteredMiningLocation, enteredSalvageLocation } from './game-controller-models';
import { runSceneZoomTransition } from '../ui/scene-transition';

/** Route sector arrivals into existing local scenes without coupling to the controller module. */
export function handleControllerLocationEntry(
  context: ControllerRuntimeContext,
  currentLocationId: string | null,
  mountMining: () => void,
  mountSalvage: () => void
): void {
  const { state, economy } = context;
  if (enteredMiningLocation(state.mode, state.previousLocationId, currentLocationId)) {
    runSceneZoomTransition(context.root, mountMining);
    return;
  }
  const enteredSalvage =
    state.mode === 'star-map' &&
    state.previousLocationId !== currentLocationId &&
    (enteredSalvageLocation(state.mode, state.previousLocationId, currentLocationId) ||
      economy.salvageEvents.event(currentLocationId) !== null);
  if (enteredSalvage) {
    if (economy.salvageEvents.event(currentLocationId)) {
      economy.salvageEvents.acceptForPlayer(currentLocationId!);
    }
    runSceneZoomTransition(context.root, mountSalvage);
    return;
  }
  // A live distress/salvage event may expire or be resolved by an NPC en route.
  // Arriving at its former coordinates must never fail without feedback.
  if (
    state.mode === 'star-map' &&
    state.previousLocationId !== currentLocationId &&
    (currentLocationId?.startsWith('salvage-distress-') ||
      currentLocationId?.startsWith('salvage-special-'))
  ) {
    context.systemLog.write('SIGNAL > KONTAKT ERLOSCHEN · NOTFALL BEHOBEN ODER BEREITS GEBORGEN');
  }
}
