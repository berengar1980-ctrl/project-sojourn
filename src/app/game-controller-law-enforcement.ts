import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { advanceEconomyDay } from './game-controller-events';
import { sectorPortByLocationId } from '../data/ports/sector-ports';

// Central Directorate institutions make arrests. Other lawful ports report
// sightings but do not perform Directorate detention. Pirate docks do neither.
export const DIRECTORATE_PORTS: ReadonlySet<string> = new Set([
  'haven', 'vigil-station', 'karth-industrial', 'helix-shipyards',
]);

export function registerSectorShips(context: ControllerRuntimeContext): void {
  const register = context.economy.legal;
  register.registerShip(context.state.activeShip.id, 'player');
  for (const npc of context.economy.sectorNpcs.npcs) register.registerShip(npc.shipId + ':' + npc.id, npc.id);
}

function transferCredit(context: ControllerRuntimeContext, creditorId: string, amount: number): void {
  if (creditorId === 'player') {
    context.economy.trade.player.credits += amount;
    context.systemLog.write('KONZESSION > ENTSCHAEDIGUNG EINGEGANGEN: +' + amount + ' CR');
  } else {
    const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === creditorId);
    if (npc) npc.credits += amount;
  }
}

export function inspectLegalDockArrival(context: ControllerRuntimeContext): void {
  if (context.world.inForeignSystem()) return;
  const locationId = context.navigation.getSnapshot().currentLocationId;
  if (!locationId) return;
  const location = context.world.world().locations.find((entry) => entry.id === locationId);
  if (location?.stationType === 'pirate' || !sectorPortByLocationId(locationId)) return;
  const { legal } = context.economy;
  const shipId = context.state.activeShip.id;
  legal.registerShip(shipId, 'player');
  const report = legal.reportSighting(shipId, locationId, context.economy.situations.currentDay, 'arrival');
  if (report) context.systemLog.write(
    'FAHNDUNG > SICHTUNG AN ' + locationId.toUpperCase() + ' UEBERMITTELT'
  );
  if (!DIRECTORATE_PORTS.has(locationId) || !legal.isWanted(shipId)) return;
  context.systemLog.write('DIREKTORUM > FESTNAHME BEI DER ANDOCKKONTROLLE');
  const result = legal.detain(
    shipId, context.economy.trade.player.credits,
    () => advanceEconomyDay(context),
    (creditorId, amount) => transferCredit(context, creditorId, amount)
  );
  context.economy.trade.player.credits -= result.confiscated;
  context.systemLog.write(
    'DIREKTORUM > STRAFLAGER: ' + result.days +
    ' TAGE, ARBEITSVERGUETUNG ' + result.laborCredits + ' CR'
  );
  context.systemLog.write(result.released
    ? 'DIREKTORUM > FORDERUNGEN BEGLICHEN, ENTLASSUNG GENEHMIGT'
    : 'DIREKTORUM > HAFTDAUER ODER OFFENE SCHULDEN PRUEFEN');
}

/**
 * Departure report is based on an actual route start, not on a preview click.
 * Allied lawful ports share route intelligence with pursuing patrols.
 */
export function reportLegalDeparture(
  context: ControllerRuntimeContext,
  originId: string | null,
  destinationId: string | null
): void {
  if (context.world.inForeignSystem() || !originId) return;
  const location = context.world.world().locations.find((entry) => entry.id === originId);
  if (location?.stationType === 'pirate' || !sectorPortByLocationId(originId)) return;
  const report = context.economy.legal.reportSighting(
    context.state.activeShip.id, originId, context.economy.situations.currentDay,
    'departure', destinationId
  );
  if (report) context.systemLog.write(
    'FAHNDUNG > ABFLUG AUS ' + originId.toUpperCase() +
    (destinationId ? ', KURS ' + destinationId.toUpperCase() : '') + ' GEMELDET'
  );
}
