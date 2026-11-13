import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { PlayerTradeService } from '../systems/economy/player-trade-service';
import type { SectorLegalRegistry } from '../systems/operations/sector-legal-registry';
import type { createPortPanel } from '../ui/port/port-panel';

type RegistrationOptions = Pick<Parameters<typeof createPortPanel>[0], 'model' | 'onForgeTransponder'>;

/** Port identity controls. Public transponder changes never erase debts on the hull ID. */
export function createPortRegistrationOptions(
  model: RegistrationOptions['model'],
  ship: ShipDefinition,
  pirateStation: boolean,
  trade: PlayerTradeService,
  log: SystemLogService,
  onRefresh: () => void,
  legal?: SectorLegalRegistry
): RegistrationOptions {
  const registration = legal?.registerShip(ship.id, 'player');
  return {
    model: {
      ...model,
      ...(registration ? {
        shipRegistration: {
          transponder: registration.transponder,
          originalTransponder: registration.originalTransponder,
          wanted: legal!.isWanted(ship.id),
          debt: legal!.debt(ship.id),
          forged: registration.transponder !== registration.originalTransponder,
          pirateStation,
        },
      } : {}),
    },
    onForgeTransponder: () => {
      if (!pirateStation || !legal) return;
      const cost = 18000;
      if (trade.player.credits < cost) {
        log.write('SCHWARZMARKT > NICHT GENUEGEND CREDITS');
        return;
      }
      const alias = 'PX-' + Math.floor(Math.random() * 0xffffffff)
        .toString(36).toUpperCase().padStart(7, '0');
      if (!legal.forgeTransponder(ship.id, alias)) {
        log.write('SCHWARZMARKT > KENNUNGSWECHSEL FEHLGESCHLAGEN');
        return;
      }
      trade.player.credits -= cost;
      log.write('SCHWARZMARKT > TRANSPONDERMANIPULATION ERFOLGREICH: ' + alias);
      onRefresh();
    },
  };
}
