import type { ShipComponentType, ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import { economyResourceById } from '../data/economy/economy-resources';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId } from '../data/ports/sector-ports';
import { createPortViewModel, type PortSystemMarketInput } from '../features/port/port-view-model';
import type { EconomyMarketService } from '../systems/economy/market-service';
import type { MarketIntelService } from '../systems/economy/market-intel-service';
import type { PlayerTradeService } from '../systems/economy/player-trade-service';
import { createCrewMember, crewCapacity, type CrewRosterService } from '../systems/crew';
import { planRouteWithProfile, type NavigationService } from '../systems/navigation';
import {
  canShipCarryResource,
  resolveShipGameplayStats,
  resolveShipRuntimeSetup,
  type ShipLoadoutService,
} from '../systems/ships';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';

function systemMarketRows(
  fromLocationId: string,
  intel: MarketIntelService
): readonly PortSystemMarketInput[] {
  return intel.entries().flatMap((entry) => {
    const destination = narrowsSector.locations.find(
      (location) => location.id === entry.locationId
    );
    if (!destination) return [];
    const route =
      entry.locationId === fromLocationId
        ? null
        : planRouteWithProfile(narrowsSector, fromLocationId, entry.locationId, 'balanced');
    return [
      {
        locationId: entry.locationId,
        locationName: destination.name,
        locationKind: destination.kind === 'station' ? 'Station' : 'Planet',
        distance: route?.distance ?? 0,
        resourceId: entry.resourceId,
        price: entry.price,
        stock: entry.stock,
        observedDay: entry.observedDay,
      },
    ];
  });
}

export function createActivePortPanel(
  root: HTMLElement,
  navigation: NavigationService,
  markets: EconomyMarketService,
  trade: PlayerTradeService,
  ship: ShipDefinition,
  crew: CrewRosterService,
  loadouts: ShipLoadoutService,
  marketIntel: MarketIntelService,
  currentDay: number,
  onReturnToStarMap: () => void,
  onRefresh: () => void,
  log: SystemLogService
): PortPanel | null {
  const locationId = navigation.getSnapshot().currentLocationId;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  const port = locationId ? sectorPortByLocationId(locationId) : null;
  const market = locationId ? markets.getMarket(locationId) : null;
  if (!location || !port || !market) return null;

  marketIntel.observeLocation(location.id, currentDay);
  const installed = loadouts.get(ship);
  const runtime = resolveShipRuntimeSetup(ship, {
    ...crew.runtimeOptions(ship),
    installed,
  });
  const gameplay = resolveShipGameplayStats(ship);
  const saleFeeRate = runtime.crewEffects.logistics.saleFeeRate;
  navigation.setCruiseSpeed(
    ship.navigation.cruiseSpeed * runtime.crewEffects.piloting.travelSpeedMultiplier
  );

  return createPortPanel({
    root,
    model: createPortViewModel(
      port,
      market,
      trade.player,
      location,
      narrowsSector.star.position,
      ship,
      {
        available: crew.availableDefinitions().map(createCrewMember),
        hired: crew.list(),
        assignments: crew.assignments(ship),
        stations: gameplay.stations,
        capacity: crewCapacity(ship),
      },
      {
        installed,
        weaponSlots: gameplay.weaponSlots,
        reactorOutput: runtime.energy.output,
        combatPowerUsed: runtime.energy.combatUsed,
        combatPowerFree: runtime.energy.combatFree,
        hullMaxHp: runtime.hullMaxHp,
        shieldMaxHp: runtime.shieldMaxHp,
      },
      systemMarketRows(location.id, marketIntel),
      Math.max(0, currentDay),
      runtime.cargoCapacityTons,
      saleFeeRate
    ),
    onReturnToStarMap,
    onMarketRoute: (destinationId) => {
      if (destinationId === location.id) return;
      navigation.selectDestination(destinationId);
      log.write('HANDEL > ROUTE ZUM VERKAUFSMARKT GESETZT');
      onReturnToStarMap();
    },
    onBuy: (resourceId) => {
      if (!canShipCarryResource(ship, resourceId)) {
        log.write('FRACHT > MINER NIMMT NUR ROHSTOFFE AUF');
        return;
      }
      const result = trade.buy(location.id, resourceId, 1, runtime.cargoCapacityTons);
      if (!result) return;
      marketIntel.observeLocation(location.id, currentDay);
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(`HANDEL > +${result.quantity} ${name.toUpperCase()} · ${-result.creditsDelta} CR`);
      onRefresh();
    },
    onSell: (resourceId) => {
      const result = trade.sell(location.id, resourceId, 1, saleFeeRate);
      if (!result) return;
      marketIntel.observeLocation(location.id, currentDay);
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > -${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
    onSellAll: (resourceId) => {
      const quantity = trade.player.cargo[resourceId]?.qty ?? 0;
      const result = trade.sell(location.id, resourceId, quantity, saleFeeRate);
      if (!result) return;
      marketIntel.observeLocation(location.id, currentDay);
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > ALLES VERKAUFT · ${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
    onSetComponentSlot: (type: ShipComponentType, index: number, componentId: string | null) => {
      if (!loadouts.setSlot(ship, type, index, componentId)) {
        log.write('SCHIFF > KOMPONENTE NICHT KOMPATIBEL');
        return;
      }
      const label = componentId ?? 'LEER';
      log.write(`SCHIFF > ${type.toUpperCase()} SLOT ${index + 1} · ${label.toUpperCase()}`);
      onRefresh();
    },
    onHireCrew: (crewId) => {
      const hired = crew.hire(crewId, ship);
      if (!hired) {
        log.write('CREW > ANHEUERUNG NICHT MÖGLICH');
        return;
      }
      log.write(`CREW > ${hired.name.toUpperCase()} ANGEHEUERT · ANTEIL ${hired.share}%`);
      onRefresh();
    },
    onAssignCrew: (stationId, crewId) => {
      if (!crew.assign(ship, stationId, crewId)) {
        log.write('CREW > STATIONSZUWEISUNG NICHT MÖGLICH');
        return;
      }
      const station = gameplay.stations.find((entry) => entry.id === stationId);
      const member = crewId ? crew.member(crewId) : null;
      log.write(
        `CREW > ${(station?.skill ?? stationId).toUpperCase()} · ${member ? member.name.toUpperCase() : 'AUTOMATIK'}`
      );
      onRefresh();
    },
  });
}
