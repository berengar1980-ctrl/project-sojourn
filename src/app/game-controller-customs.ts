import type { ShipDefinition } from '../core/ship-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId, sectorPorts } from '../data/ports/sector-ports';
import {
  createCustomsInspectionPanel,
  type CustomsInspectionPanel,
} from '../ui/customs/customs-inspection-panel';
import { resolveShipRuntimeSetup } from '../systems/ships';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { transferCredit } from './game-controller-law-enforcement';

const patrolChecks = new WeakMap<
  ControllerRuntimeContext,
  { seconds: number; travelling: boolean; checked: Set<string> }
>();
const activePanels = new WeakMap<ControllerRuntimeContext, CustomsInspectionPanel>();

function normalCapacity(context: ControllerRuntimeContext): number {
  const ship = context.state.activeShip;
  return resolveShipRuntimeSetup(ship, {
    ...context.crew.runtimeOptions(ship),
    installed: context.loadouts.get(ship),
  }).cargoCapacityTons;
}
function showInspection(context: ControllerRuntimeContext): void {
  activePanels.get(context)?.destroy();
  const current = context.economy.smuggling.state.inspection;
  if (!current) return;
  context.systemLog.write(
    current.source === 'harbor'
      ? 'ZOLL > HAFENKONTROLLE ANGEORDNET'
      : 'FLOTTENPATROUILLE > FRACHTKONTROLLE ANGEORDNET'
  );
  const panel = createCustomsInspectionPanel(
    context.root,
    context.economy.smuggling,
    context.state.activeShip.id,
    normalCapacity(context),
    (outcome, patrolId) => {
      activePanels.delete(context);
      context.systemLog.write('ZOLL > ' + (outcome ?? 'FREIGABE').toUpperCase());
      if (outcome === 'resisted' && patrolId) {
        context.engagements.engageNpcNow(patrolId);
      }
    }
  );
  activePanels.set(context, panel);
}
export function canSwitchSmugglingShip(
  context: ControllerRuntimeContext,
  nextShip: ShipDefinition
): boolean {
  if (context.economy.smuggling.hiddenUsed() > 0) {
    context.systemLog.write('SCHMUGGEL > VERDECKTEN FRACHTRAUM VOR SCHIFFSWECHSEL LEEREN');
    return false;
  }
  context.economy.smuggling.activateShip(nextShip.id);
  return true;
}

/** An imposed customs inspection freezes sector movement while the modal is open. */
export function tickCustoms(context: ControllerRuntimeContext): boolean {
  if (!context.economy.smuggling.state.inspection) return false;
  return true;
}

export function inspectDockArrival(context: ControllerRuntimeContext): void {
  if (context.world.inForeignSystem()) return;
  const locationId = context.navigation.getSnapshot().currentLocationId;
  if (!locationId || locationId === 'blackjaw-outpost' || locationId === 'gallows-anchor') return;
  const port = sectorPortByLocationId(locationId);
  if (!port || context.economy.smuggling.state.inspection) return;
  const chance = context.economy.smuggling.inspectionChance(
    'harbor',
    port.security,
    context.state.activeShip.id
  );
  if (Math.random() >= chance) return;
  const strength = port.security === 'high' ? 0.76 : port.security === 'medium' ? 0.52 : 0.3;
  if (context.economy.smuggling.startInspection('harbor', locationId, strength)) {
    showInspection(context);
  }
}

/** A patrol must physically encounter the travelling player; no omniscient inspection. */
export function inspectPatrolTravel(context: ControllerRuntimeContext, deltaSeconds: number): void {
  if (context.world.inForeignSystem() || context.economy.smuggling.state.inspection) return;
  const nav = context.navigation.getSnapshot();
  let check = patrolChecks.get(context);
  if (!check) {
    check = { seconds: 0, travelling: false, checked: new Set() };
    patrolChecks.set(context, check);
  }
  if (!nav.isTravelling) {
    check.seconds = 0;
    check.travelling = false;
    check.checked.clear();
    return;
  }
  if (!check.travelling) {
    check.seconds = 0;
    check.checked.clear();
    check.travelling = true;
  }
  check.seconds += Math.max(0, deltaSeconds);
  if (check.seconds < 4) return;
  check.seconds = 0;
  const patrol = context.economy.sectorNpcs.npcs
    .filter((npc) => npc.job === 'patrol' && !npc.pirate && npc.hullHp > 0)
    .filter((npc) => !check.checked.has(npc.id))
    .map((npc) => ({
      npc,
      distance: Math.hypot(
        context.economy.sectorNpcs.livePosition(npc).x - nav.currentPosition.x,
        context.economy.sectorNpcs.livePosition(npc).y - nav.currentPosition.y
      ),
    }))
    .filter((entry) => entry.distance <= 650)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!patrol) return;
  check.checked.add(patrol.npc.id);
  const shipId = context.state.activeShip.id;
  if (context.economy.legal.isRecognizedWanted(shipId, Math.random() < 0.35)) {
    const debt = context.economy.legal.debt(shipId);
    const pay = context.economy.trade.player.credits >= debt && window.confirm(
      'DIREKTORUM-PATROUILLE ' + patrol.npc.name + '\n' +
      'Schiff zur Fahndung ausgeschrieben.\n' +
      'Offene Forderungen: ' + debt + ' CR\n\n' +
      'Alle Forderungen zahlen? ABBRECHEN = Flucht/Widerstand.'
    );
    if (pay) {
      const payment = context.economy.legal.settle(
        shipId, context.economy.trade.player.credits
      );
      context.economy.trade.player.credits -= payment.paid;
      for (const transfer of payment.transfers)
        transferCredit(context, transfer.creditorId, transfer.amount);
      context.systemLog.write(
        'PATROUILLE > ' + payment.paid + ' CR BEGLICHEN · FAHNDUNG BEENDET'
      );
    } else {
      context.systemLog.write(
        'PATROUILLE > ZAHLUNG VERWEIGERT · GEFECHT ODER FLUCHT'
      );
      context.engagements.engageNpcNow(patrol.npc.id);
    }
    return;
  }
  const nearPort = [...sectorPorts]
    .map((port) => {
      const position = narrowsSector.locations.find(
        (entry) => entry.id === port.locationId
      )?.position;
      return {
        port,
        distance: position
          ? Math.hypot(position.x - nav.currentPosition.x, position.y - nav.currentPosition.y)
          : Infinity,
      };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.port;
  const security = nearPort?.security ?? 'medium';
  const chance = context.economy.smuggling.inspectionChance(
    'patrol',
    security,
    context.state.activeShip.id
  );
  if (Math.random() >= chance) return;
  const strength = security === 'high' ? 0.85 : security === 'medium' ? 0.7 : 0.5;
  if (
    context.economy.smuggling.startInspection(
      'patrol',
      nearPort?.locationId ?? patrol.npc.locationId,
      strength,
      patrol.npc.id
    )
  ) {
    showInspection(context);
  }
}
