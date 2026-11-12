import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import { economyResourceById } from '../data/economy/economy-resources';
import type { PlayerTradeService } from '../systems/economy/player-trade-service';
import {
  HIDDEN_CARGO_HOLD,
  HIDDEN_HOLD_INTEL_COST,
  HIDDEN_HOLD_INTEL_DAY,
  type SmugglingService,
} from '../systems/economy/smuggling-service';
import type { createPortPanel } from '../ui/port/port-panel';

type PortOptions = Parameters<typeof createPortPanel>[0];

export function createSmugglingPortOptions(
  smuggling: SmugglingService,
  trade: PlayerTradeService,
  ship: ShipDefinition,
  locationId: string,
  cargoCapacity: number,
  day: number,
  log: SystemLogService,
  onRefresh: () => void
): Pick<
  PortOptions,
  | 'smuggling'
  | 'onBuyHoldIntel'
  | 'onInstallHiddenHold'
  | 'onConcealCargo'
  | 'onRevealCargo'
  | 'onPirateProtection'
> {
  const faction =
    locationId === 'blackjaw-outpost'
      ? 'pirates'
      : locationId === 'gallows-anchor'
        ? 'pirates2'
        : null;
  const hiddenRows = Object.entries(trade.player.cargo)
    .filter(([id, lot]) => lot.qty > 0 && economyResourceById(id)?.legality === 'illegal')
    .map(([id, lot]) => ({
      id,
      name: economyResourceById(id)?.name ?? id,
      visible: lot.qty - (lot.hiddenQty ?? 0),
      hidden: lot.hiddenQty ?? 0,
    }));
  return {
    smuggling: {
      day,
      known: smuggling.state.hiddenHoldIntel,
      installed: smuggling.hiddenCapacity(ship.id) > 0,
      hiddenCapacity: HIDDEN_CARGO_HOLD.capacity,
      hiddenUsed: smuggling.hiddenUsed(),
      normalPenalty: HIDDEN_CARGO_HOLD.normalCargoPenalty,
      concealment: HIDDEN_CARGO_HOLD.concealment,
      price: HIDDEN_CARGO_HOLD.cost,
      intelPrice: HIDDEN_HOLD_INTEL_COST,
      intelDay: HIDDEN_HOLD_INTEL_DAY,
      suspicion: smuggling.state.suspicion,
      protectionFaction: smuggling.state.protectionFaction,
      atPirateBase: faction !== null,
      pirateFaction: faction,
      hiddenRows,
    },
    onBuyHoldIntel: () => {
      if (!smuggling.learnIntel(day)) {
        log.write('UNTERDECK > KONTAKT NICHT VERFÜGBAR ODER CREDITS FEHLEN');
      } else {
        log.write('UNTERDECK > KONTAKT ZUR GEHEIMEN UNTERWELT-WERFT FREIGESCHALTET');
      }
      onRefresh();
    },
    onInstallHiddenHold: () => {
      if (smuggling.install(ship.id, locationId, cargoCapacity)) {
        log.write(
          'UNTERWELT-WERFT > VERDECKTER FRACHTRAUM EINGEBAUT · 24 t VERDECKT · -12 t NORMAL'
        );
      } else {
        log.write(
          'UNTERWELT-WERFT > EINBAU NICHT MÖGLICH · KONTAKT, CREDITS, FRACHT UND ORT PRÜFEN'
        );
      }
      onRefresh();
    },
    onConcealCargo: (resourceId) => {
      const moved = smuggling.conceal(resourceId, 1, ship.id);
      log.write('SCHMUGGEL > ' + moved + ' t IM VERDECKTEN FRACHTRAUM VERSTAUT');
      onRefresh();
    },
    onRevealCargo: (resourceId) => {
      const moved = smuggling.reveal(resourceId, 1, ship.id, cargoCapacity);
      log.write('SCHMUGGEL > ' + moved + ' t IN DEN NORMALEN FRACHTRAUM VERLAGERT');
      onRefresh();
    },
    onPirateProtection: () => {
      if (faction && smuggling.protect(faction, locationId)) {
        log.write('UNTERWELT > SCHUTZBRIEF AKTIV · 5 % ALLER ILLEGALEN VERKÄUFE');
      }
      onRefresh();
    },
  };
}
