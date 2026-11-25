import { registerPermanentSalvageStocks } from './game-controller-salvage-stocks';
import type { SalvageField, SectorSalvageEvent } from '../core/salvage-types';
import type { WorldLocation } from '../core/world-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { generateSalvageField } from '../systems/salvage';
import { generateSectorSalvageEventField } from '../systems/salvage/salvage-event-field-generator';

/** Reuse the very same wreck objects in every visit; never re-roll combat salvage. */
export function fieldWithCareerCombatWrecks(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  seed: number,
  preservedField?: SalvageField,
  sectorEvent?: SectorSalvageEvent | null
): SalvageField | undefined {
  if (preservedField) return preservedField;
  const world = fieldWorldFor(context);
  const combatWrecks = world.combatWrecks(location.id);
  let field: SalvageField | undefined;
  if (sectorEvent) {
    field = context.state.salvageEventFields.get(sectorEvent.id);
    if (!field) {
      field = generateSectorSalvageEventField(sectorEvent);
      context.state.salvageEventFields.set(sectorEvent.id, field);
    }
  } else if (combatWrecks.length && location.activities.mine && !location.activities.salvage) {
    const miningField = world.field(location.id)?.instance;
    field = {
      id: 'combat-salvage-' + location.id,
      sourceLocationId: location.id,
      seed: miningField?.seed ?? seed,
      width: miningField?.width ?? 2400,
      height: miningField?.height ?? 1800,
      wrecks: combatWrecks,
    };
  } else if (location.activities.salvage || combatWrecks.length) {
    field = generateSalvageField(location.id, seed, location.dangerLevel);
    if (location.activities.salvage) {
      context.economy.wreckClaims.restoreField(field);
      registerPermanentSalvageStocks(context.economy.simulation, field);
      context.economy.wreckClaims.rememberField(field);
    }
  }
  if (field && field.wrecks !== combatWrecks) {
    const known = new Set(field.wrecks.map((wreck) => wreck.id));
    for (const wreck of combatWrecks) {
      if (!known.has(wreck.id)) field.wrecks.push(wreck);
    }
  }
  return field;
}
