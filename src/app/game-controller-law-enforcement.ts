import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { advanceEconomyDay } from './game-controller-events';
import { PENAL_LABOR_CREDITS_PER_DAY } from '../systems/operations/sector-legal-registry';
import { sectorPortByLocationId } from '../data/ports/sector-ports';
import { createDetentionPanel, type DetentionPanel } from '../ui/legal/legal-detention-panel';
import { settleLegalDebt, transferCredit } from './game-controller-legal-ledger';
export { transferCredit } from './game-controller-legal-ledger';

interface DetentionSession {
  readonly shipId: string;
  days: number;
  laborCredits: number;
  accumulator: number;
  panel: DetentionPanel | null;
}
const detentions = new WeakMap<ControllerRuntimeContext, DetentionSession>();
const LABOR_DAYS_PER_SECOND = 12;

// Central Directorate institutions make arrests. Other lawful ports report
// sightings but do not perform Directorate detention. Pirate docks do neither.
export const DIRECTORATE_PORTS: ReadonlySet<string> = new Set([
  'haven',
  'vigil-station',
  'karth-industrial',
  'helix-shipyards',
]);

export function registerSectorShips(context: ControllerRuntimeContext): void {
  const register = context.economy.legal;
  register.registerShip(context.state.activeShip.id, 'player');
  for (const npc of context.economy.sectorNpcs.npcs)
    register.registerShip(npc.shipId + ':' + npc.id, npc.id);
}

export function dispatchPatrolToReport(
  context: ControllerRuntimeContext,
  locationId: string,
  destinationId: string | null
): void {
  const world = context.world.world();
  const targetId = world.locations.some((entry) => entry.id === destinationId)
    ? destinationId!
    : locationId;
  const position = world.locations.find((entry) => entry.id === targetId)?.position;
  if (!position) return;
  const candidates = context.economy.sectorNpcs.npcs
    .filter(
      (npc) =>
        npc.job === 'patrol' &&
        !npc.pirate &&
        npc.hullHp > 0 &&
        !context.economy.sectorNpcs.isTravelling(npc)
    )
    .sort((a, b) => {
      const pa = context.economy.sectorNpcs.livePosition(a);
      const pb = context.economy.sectorNpcs.livePosition(b);
      return (
        Math.hypot(pa.x - position.x, pa.y - position.y) -
        Math.hypot(pb.x - position.x, pb.y - position.y)
      );
    });
  for (const patrol of candidates) {
    if (context.economy.sectorNpcs.requestTravel(patrol, targetId, 'Fahndung · Sichtungsmeldung')) {
      context.systemLog.write(
        'PATROUILLE > ' +
          patrol.name.toUpperCase() +
          ' SUCHT GESUCHTES SCHIFF BEI ' +
          targetId.toUpperCase()
      );
      break;
    }
  }
}

/** A friendly non-Directorate faction broadcasts an orbital sighting even
 * when the wanted ship does not dock; police custody still requires docking. */
export function reportLegalOrbitalArrival(
  context: ControllerRuntimeContext,
  locationId: string | null
): void {
  if (context.world.inForeignSystem() || !locationId || DIRECTORATE_PORTS.has(locationId)) return;
  const location = context.world.world().locations.find((entry) => entry.id === locationId);
  if (location?.stationType === 'pirate' || !sectorPortByLocationId(locationId)) return;
  const shipId = context.state.activeShip.id;
  if (!context.economy.legal.isRecognizedWanted(shipId, Math.random() < 0.15)) return;
  const report = context.economy.legal.reportSighting(
    shipId,
    locationId,
    context.economy.situations.currentDay,
    'arrival'
  );
  if (report) {
    context.systemLog.write('FAHNDUNG > ORBITALE SICHTUNG BEI ' + locationId.toUpperCase());
    dispatchPatrolToReport(context, locationId, null);
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
  const directorate = DIRECTORATE_PORTS.has(locationId);
  const recognized = legal.isRecognizedWanted(shipId, Math.random() < (directorate ? 0.7 : 0.15));
  if (!recognized) return;
  const report = legal.reportSighting(
    shipId,
    locationId,
    context.economy.situations.currentDay,
    'arrival'
  );
  if (report)
    context.systemLog.write('FAHNDUNG > SICHTUNG AN ' + locationId.toUpperCase() + ' UEBERMITTELT');
  if (!directorate || !legal.isWanted(shipId)) {
    dispatchPatrolToReport(context, locationId, null);
    return;
  }
  context.systemLog.write('DIREKTORUM > FESTNAHME BEI DER ANDOCKKONTROLLE');
  const immediate = settleLegalDebt(context, shipId, context.economy.trade.player);
  if (!legal.isWanted(shipId)) {
    context.systemLog.write(
      'DIREKTORUM > FORDERUNG VOLLSTAENDIG EINGEZOGEN: ' + immediate.paid + ' CR'
    );
    return;
  }
  legal.beginCustody(shipId);
  detentions.set(context, {
    shipId,
    days: 0,
    laborCredits: 0,
    accumulator: 0,
    panel: null,
  });
  context.systemLog.write(
    'DIREKTORUM > STRAFLAGER: RESTSCHULD ' +
      legal.debt(shipId) +
      ' CR, TAGESVERDIENST ' +
      PENAL_LABOR_CREDITS_PER_DAY +
      ' CR'
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
  if (!context.economy.legal.isRecognizedWanted(context.state.activeShip.id, Math.random() < 0.15))
    return;
  const report = context.economy.legal.reportSighting(
    context.state.activeShip.id,
    originId,
    context.economy.situations.currentDay,
    'departure',
    destinationId
  );
  if (report) {
    context.systemLog.write(
      'FAHNDUNG > ABFLUG AUS ' +
        originId.toUpperCase() +
        (destinationId ? ', KURS ' + destinationId.toUpperCase() : '') +
        ' GEMELDET'
    );
    dispatchPatrolToReport(context, originId, destinationId);
  }
}

/** NPC criminals are detained at Directorate ports under exactly the same
 * creditor ledger and labor rate. Their economy autonomy remains paused while
 * imprisoned, but the rest of the world continues normally. */
export function advanceNpcPenalCustody(context: ControllerRuntimeContext): void {
  const { economy } = context;
  const { legal } = economy;
  const day = economy.situations.currentDay;
  for (const npc of economy.sectorNpcs.npcs) {
    if (npc.id.startsWith('security-drone:')) continue;
    const shipId = npc.shipId + ':' + npc.id;
    if (economy.npcPrisoners.has(npc.id)) {
      const labor = legal.settle(shipId, PENAL_LABOR_CREDITS_PER_DAY);
      for (const transfer of labor.transfers)
        transferCredit(context, transfer.creditorId, transfer.amount);
      if (legal.isWanted(shipId)) continue;
      economy.npcPrisoners.delete(npc.id);
      npc.activityId = 'dock';
      npc.activity = 'Entlassung aus Straflager';
      context.systemLog.write('DIREKTORUM > ' + npc.name.toUpperCase() + ' ENTLASSEN');
      continue;
    }
    if (
      !DIRECTORATE_PORTS.has(npc.locationId) ||
      economy.sectorNpcs.isTravelling(npc) ||
      !legal.isWanted(shipId)
    )
      continue;
    // A false registration makes recognition harder, but not impossible.
    const fingerprint = day + npc.id.length * 17 + npc.name.length * 13;
    const deepCheck = fingerprint % 10 < 7;
    if (!legal.isRecognizedWanted(shipId, deepCheck)) continue;
    settleLegalDebt(context, shipId, npc);
    if (!legal.isWanted(shipId)) {
      context.systemLog.write('DIREKTORUM > ' + npc.name.toUpperCase() + ' HAT SCHULDEN BEZAHLT');
      continue;
    }
    economy.npcPrisoners.add(npc.id);
    legal.beginCustody(shipId);
    npc.activityId = 'dock';
    npc.activity = 'Straflager · Schuld ' + legal.debt(shipId) + ' CR';
    context.systemLog.write(
      'DIREKTORUM > ' + npc.name.toUpperCase() + ' IN STRAFLAGER EINGEWIESEN'
    );
  }
}

/** During detention the ordinary game tick is frozen, but every day still
 * invokes the complete economic day transition. No credits are fabricated
 * outside the shared creditor ledger, and no second penalty is applied. */
export function tickLegalDetention(
  context: ControllerRuntimeContext,
  deltaSeconds: number
): boolean {
  const session = detentions.get(context);
  if (!session) return false;
  if (!session.panel) session.panel = createDetentionPanel(context.root);
  session.accumulator += Math.max(0, Math.min(deltaSeconds, 0.25)) * LABOR_DAYS_PER_SECOND;
  const days = Math.floor(session.accumulator);
  session.accumulator -= days;
  for (let i = 0; i < days && context.economy.legal.isWanted(session.shipId); i++) {
    advanceEconomyDay(context);
    advanceNpcPenalCustody(context);
    session.days++;
    const payment = context.economy.legal.settle(session.shipId, PENAL_LABOR_CREDITS_PER_DAY);
    session.laborCredits += payment.paid;
    for (const transfer of payment.transfers)
      transferCredit(context, transfer.creditorId, transfer.amount);
  }
  const debt = context.economy.legal.debt(session.shipId);
  session.panel?.update(session.days, debt, session.laborCredits);
  if (debt > 0) return true;
  session.panel?.destroy();
  detentions.delete(context);
  context.systemLog.write(
    'DIREKTORUM > NACH ' + session.days + ' HAFTTAGEN ENTLASSEN. SCHULDEN VOLLSTAENDIG BEGLICHEN'
  );
  return true;
}
