import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPorts } from '../data/ports/sector-ports';
import { planRouteWithProfile } from '../systems/navigation';
import type { MarketIntelService } from '../systems/economy/market-intel-service';
import type { PortSystemMarketInput } from '../features/port/port-view-model';

export function systemMarketRows(
  fromLocationId: string,
  intel: MarketIntelService
): readonly PortSystemMarketInput[] {
  return sectorPorts.flatMap((port) => {
    const destination = narrowsSector.locations.find((location) => location.id === port.locationId);
    if (!destination) return [];
    const route =
      port.locationId === fromLocationId
        ? null
        : planRouteWithProfile(narrowsSector, fromLocationId, port.locationId, 'balanced');
    const produced = new Set(port.producedCommodityIds);
    const needed = new Set(port.neededCommodityIds);

    return port.commodities.map((commodity) => {
      const observed = intel.entry(port.locationId, commodity.id);
      return {
        locationId: port.locationId,
        locationName: destination.name,
        locationKind: destination.kind === 'station' ? 'Station' : 'Planet',
        distance: route?.distance ?? 0,
        resourceId: commodity.id,
        price: observed?.price ?? null,
        stock: observed?.stock ?? null,
        observedDay: observed?.observedDay ?? null,
        expectation: produced.has(commodity.id)
          ? 'cheap'
          : needed.has(commodity.id)
            ? 'expensive'
            : 'neutral',
      };
    });
  });
}
