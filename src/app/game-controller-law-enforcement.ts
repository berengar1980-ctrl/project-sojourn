import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { advanceEconomyDay } from './game-controller-events';
import { PENAL_LABOR_CREDITS_PER_DAY } from '../systems/operations/sector-legal-registry';
import { sectorPortByLocationId } from '../data/ports/sector-ports';

interface DetentionSession {
  readonly shipId: string;
  readonly initialDebt: number;
  days: number;
  laborCredits: number;
  accumulator: number;
  panel: HTMLElement | null;
}
const detentions = new WeakMap<ControllerRuntimeContext, DetentionSession>();
const LABOR_DAYS_PER_SECOND = 12;

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
  const immediate = legal.settle(shipId, context.economy.trade.player.credits);
  context.economy.trade.player.credits -= immediate.paid;
  for (const transfer of immediate.transfers)
    transferCredit(context, transfer.creditorId, transfer.amount);
  if (!legal.isWanted(shipId)) {
    context.systemLog.write(
      'DIREKTORUM > FORDERUNG VOLLSTAENDIG EINGEZOGEN: ' + immediate.paid + ' CR'
    );
    return;
  }
  detentions.set(context, {
    shipId,
    initialDebt: legal.debt(shipId),
    days: 0,
    laborCredits: 0,
    accumulator: 0,
    panel: null,
  });
  context.systemLog.write(
    'DIREKTORUM > STRAFLAGER: RESTSCHULD ' + legal.debt(shipId) +
    ' CR, TAGESVERDIENST ' + PENAL_LABOR_CREDITS_PER_DAY + ' CR'
  );
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

/** During detention the ordinary game tick is frozen, but every day still
 * invokes the complete economic day transition. No credits are fabricated
 * outside the shared creditor ledger, and no second penalty is applied. */
export function tickLegalDetention(
  context: ControllerRuntimeContext, deltaSeconds: number
): boolean {
  const session = detentions.get(context);
  if (!session) return false;
  if (!session.panel) {
    const panel = document.createElement('section');
    panel.className = 'directorate-detention-panel';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:rgba(4,8,14,.96);' +
      'color:#e6e9ec;display:grid;place-content:center;text-align:center;' +
      'font:18px system-ui;padding:32px;pointer-events:all';
    context.root.appendChild(panel);
    session.panel = panel;
  }
  session.accumulator += Math.max(0, Math.min(deltaSeconds, 0.25)) * LABOR_DAYS_PER_SECOND;
  const days = Math.floor(session.accumulator);
  session.accumulator -= days;
  for (let i = 0; i < days && context.economy.legal.isWanted(session.shipId); i++) {
    advanceEconomyDay(context);
    session.days++;
    const payment = context.economy.legal.settle(
      session.shipId, PENAL_LABOR_CREDITS_PER_DAY
    );
    session.laborCredits += payment.paid;
    for (const transfer of payment.transfers)
      transferCredit(context, transfer.creditorId, transfer.amount);
  }
  const debt = context.economy.legal.debt(session.shipId);
  if (session.panel) {
    session.panel.textContent =
      'TERRANISCHES DIREKTORUM – STRAFLAGER\\n' +
      'Hafttag: ' + session.days + '\\n' +
      'Restschuld: ' + debt.toLocaleString('de-DE') + ' CR\\n' +
      'Arbeitsgutschrift: ' + session.laborCredits.toLocaleString('de-DE') +
      ' CR (' + PENAL_LABOR_CREDITS_PER_DAY + ' CR / Tag)';
    session.panel.style.whiteSpace = 'pre-line';
  }
  if (debt > 0) return true;
  session.panel?.remove();
  detentions.delete(context);
  context.systemLog.write(
    'DIREKTORUM > NACH ' + session.days +
    ' HAFTTAGEN ENTLASSEN. SCHULDEN VOLLSTAENDIG BEGLICHEN'
  );
  return true;
}
