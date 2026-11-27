import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { AsteroidFieldWorld } from '../systems/operations/asteroid-field-world';
import { invalidateSalvagePhysics } from '../systems/salvage/salvage-container-motion';
import { narrowsSector } from '../data/maps/narrows-sector';
import { backgroundSalvagePatrol } from './game-controller-salvage-drone-world';

export function advanceFieldWreckLifetime(
  context: ControllerRuntimeContext,
  fieldWorld: AsteroidFieldWorld,
  deltaSeconds: number
): void {
  fieldWorld.advanceCombatWreckLifetime(deltaSeconds, (locationId, ids) => {
    for (const id of ids) context.economy.simulation.releasePhysicalStock(id);
    context.engagements.removeFieldCombatWrecks(ids);
    const sceneField = context.state.salvageScene?.getField();
    const fields = new Set([
      sceneField,
      backgroundSalvagePatrol(context, locationId)?.field,
      ...context.state.salvageEventFields.values(),
    ]);
    for (const field of fields) {
      if (field?.sourceLocationId !== locationId) continue;
      for (let i = field.wrecks.length - 1; i >= 0; i--) {
        if (ids.has(field.wrecks[i]!.id)) field.wrecks.splice(i, 1);
      }
      invalidateSalvagePhysics(field);
    }
  });
}

export function advanceRemainingWreckMotion(
  context: ControllerRuntimeContext,
  fieldWorld: AsteroidFieldWorld,
  deltaSeconds: number,
  localId: string | null,
  combatLocations: Set<string>
): void {
  const salvageLocation =
    context.state.mode === 'salvage-space'
      ? context.state.salvageScene?.getField().sourceLocationId
      : null;
  // Permanent salvage runtimes own their own wreck drift and combat poses.
  for (const location of narrowsSector.locations)
    if (backgroundSalvagePatrol(context, location.id)) combatLocations.add(location.id);
  fieldWorld.advanceCombatWreckMotion(
    deltaSeconds,
    context.state.embeddedCombat === 'local-space' ? localId : salvageLocation,
    combatLocations
  );
}
