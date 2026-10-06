import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import { economyResourceById } from '../data/economy/economy-resources';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId } from '../data/ports/sector-ports';
import { createPortViewModel } from '../features/port/port-view-model';
import type { EconomyMarketService } from '../systems/economy/market-service';
import type { PlayerTradeService } from '../systems/economy/player-trade-service';
import type { NavigationService } from '../systems/navigation';
import {
  canShipCarryResource,
  resolveShipRuntimeSetup,
  type ShipRuntimeOptions,
} from '../systems/ships';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';

export function createActivePortPanel(
  root: HTMLElement,
  navigation: NavigationService,
  markets: EconomyMarketService,
  trade: PlayerTradeService,
  ship: ShipDefinition,
  runtimeOptions: ShipRuntimeOptions,
  onReturnToStarMap: () => void,
  onRefresh: () => void,
  log: SystemLogService
): PortPanel | null {
  const locationId = navigation.getSnapshot().currentLocationId;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  const port = locationId ? sectorPortByLocationId(locationId) : null;
  const market = locationId ? markets.getMarket(locationId) : null;
  if (!location || !port || !market) return null;
  const runtime = resolveShipRuntimeSetup(ship, runtimeOptions);

  return createPortPanel({
    root,
    model: createPortViewModel(
      port,
      market,
      trade.player,
      location,
      ship,
      runtime.cargoCapacityTons
    ),
    onReturnToStarMap,
    onBuy: (resourceId) => {
      if (!canShipCarryResource(ship, resourceId)) {
        log.write('FRACHT > MINER NIMMT NUR ROHSTOFFE AUF');
        return;
      }
      const result = trade.buy(location.id, resourceId, 1, runtime.cargoCapacityTons);
      if (!result) return;
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(`HANDEL > +${result.quantity} ${name.toUpperCase()} · ${-result.creditsDelta} CR`);
      onRefresh();
    },
    onSell: (resourceId) => {
      const result = trade.sell(location.id, resourceId, 1);
      if (!result) return;
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > -${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
  });
}
