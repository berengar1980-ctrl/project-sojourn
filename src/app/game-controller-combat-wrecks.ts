import { wreckCombatBody } from '../systems/combat/field-combat-arena';
import type { SalvageField, SalvageWreck } from '../core/salvage-types';
import type { StrategicCombatSnapshot } from '../systems/combat/strategic-combat-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { addDestroyedShipWreck } from '../systems/salvage/combat-destruction-wreck';

/** Store defeated ships in the authoritative career field, not in a disposable combat scene. */
export function recordCareerCombatWrecks(
  context: ControllerRuntimeContext,
  snapshot: StrategicCombatSnapshot,
  locationId: string | null
): readonly SalvageWreck[] {
  if (!locationId) return [];
  const world = fieldWorldFor(context);
  const wrecks = world.combatWrecks(locationId);
  const field: SalvageField = {
    id: 'combat-field-' + locationId,
    sourceLocationId: locationId,
    seed: snapshot.arena.backdropSeed ?? 0,
    width: snapshot.arena.width,
    height: snapshot.arena.height,
    wrecks: [...wrecks],
  };
  const encounterId = [
    locationId,
    snapshot.attacker.id,
    snapshot.defender.id,
    Math.round(snapshot.elapsedSeconds * 1000),
    wrecks.length,
  ].join('-');
  const created: SalvageWreck[] = [];
  for (const ship of [snapshot.attacker, snapshot.defender]) {
    if (ship.hullHp > 0) continue;
    const wreck = addDestroyedShipWreck(field, ship, encounterId, snapshot.elapsedSeconds);
    if (wreck) {
      created.push(wreck);
      if (snapshot.arena.backdropSeed !== undefined) {
        context.engagements?.registerFieldCombatWreck?.(
          locationId,
          snapshot.arena.backdropSeed,
          ship.id,
          wreckCombatBody(wreck)
        );
      }
    }
  }
  world.registerCombatWrecks(locationId, created);
  const liveField = context.state.salvageScene?.getField();
  if (liveField?.sourceLocationId === locationId) {
    const ids = new Set(liveField.wrecks.map((wreck) => wreck.id));
    for (const wreck of created) {
      if (ids.has(wreck.id)) continue;
      liveField.wrecks.push(wreck);
      ids.add(wreck.id);
    }
  }
  for (const wreck of created) {
    context.systemLog.write('BERGUNG > NEUES KAMPFWRACK: ' + wreck.name.toUpperCase());
  }
  return created;
}
