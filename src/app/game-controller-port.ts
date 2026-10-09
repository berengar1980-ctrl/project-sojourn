import type { ShipComponentType, ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import { economyResourceById } from '../data/economy/economy-resources';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId, sectorPorts } from '../data/ports/sector-ports';
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
  getShipComponent,
  getAllShipDefinitions,
  getCompatibleShipComponents,
  salvagedComponentAppraisal,
  type ShipComponentInventoryService,
  type ShipLoadoutService,
  type ShipyardResearchService,
} from '../systems/ships';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';

function systemMarketRows(
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

type PortPanelOptions = Parameters<typeof createPortPanel>[0];
type ActivePortLocation = (typeof narrowsSector.locations)[number];
type ActivePortDefinition = NonNullable<ReturnType<typeof sectorPortByLocationId>>;
type ActivePortMarket = NonNullable<ReturnType<EconomyMarketService['getMarket']>>;
type ActivePortRuntime = ReturnType<typeof resolveShipRuntimeSetup>;
type ActivePortGameplay = ReturnType<typeof resolveShipGameplayStats>;
type ActivePortInstalled = ReturnType<ShipLoadoutService['get']>;

interface ActivePortContext {
  readonly location: ActivePortLocation;
  readonly port: ActivePortDefinition;
  readonly market: ActivePortMarket;
  readonly navigation: NavigationService;
  readonly trade: PlayerTradeService;
  readonly ship: ShipDefinition;
  readonly crew: CrewRosterService;
  readonly loadouts: ShipLoadoutService;
  readonly marketIntel: MarketIntelService;
  readonly componentInventory: ShipComponentInventoryService;
  readonly shipyardResearch: ShipyardResearchService;
  readonly ownedShipIds: Set<string>;
  readonly onChangeShip: (ship: ShipDefinition) => void;
  readonly installed: ActivePortInstalled;
  readonly runtime: ActivePortRuntime;
  readonly gameplay: ActivePortGameplay;
  readonly currentDay: number;
  readonly onReturnToStarMap: () => void;
  readonly onRefresh: () => void;
  readonly log: SystemLogService;
}

function createActivePortModel(context: ActivePortContext): PortPanelOptions['model'] {
  const { port, market, trade, location, ship, crew, installed, runtime, gameplay } = context;
  const shipyardTypes = [
    'reactor',
    'engine',
    'shield',
    'hull',
    'sensor',
    'weapon',
    'mine',
    'cargo',
    'mining',
    'salvage',
  ] as const;

  return createPortViewModel(
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
    systemMarketRows(location.id, context.marketIntel),
    Math.max(0, context.currentDay),
    runtime.cargoCapacityTons,
    runtime.crewEffects.logistics.saleFeeRate,
    {
      loose: context.componentInventory.list(),
      variants: shipyardTypes.flatMap((type) =>
        context.shipyardResearch.variants(type, gameplay.maxComponentTier)
      ),
      catalog: shipyardTypes.flatMap((type) => [
        ...getCompatibleShipComponents(type, gameplay.maxComponentTier),
        ...context.shipyardResearch.variants(type, gameplay.maxComponentTier),
      ]),
      ships: getAllShipDefinitions().map((offer) => ({
        id: offer.id,
        name: offer.name,
        role: offer.role,
        price: Math.round(offer.nominalLengthMeters * 12000),
        owned: context.ownedShipIds.has(offer.id),
        spriteUrl: offer.sprite.assetUrl,
        lengthMeters: offer.nominalLengthMeters,
        cargoCapacityTons: offer.cargoCapacityTons,
        speed: resolveShipGameplayStats(offer).cruiseSpeed,
        hullMaxHp: resolveShipGameplayStats(offer).hullPoints,
        shieldMaxHp: Math.round(
          offer.sprite.hardpoints.shield.maxHp * resolveShipGameplayStats(offer).shieldModifier
        ),
        weaponSlots: resolveShipGameplayStats(offer).weaponSlots,
        crewBerths: resolveShipGameplayStats(offer).crewBerths,
        maxComponentTier: resolveShipGameplayStats(offer).maxComponentTier,
      })),
    }
  );
}

function createTradeCallbacks(
  context: ActivePortContext
): Pick<PortPanelOptions, 'onMarketRoute' | 'onBuy' | 'onSell' | 'onSellAll'> {
  const { navigation, trade, ship, marketIntel, location, currentDay, runtime, log, onRefresh } =
    context;
  const saleFeeRate = runtime.crewEffects.logistics.saleFeeRate;

  return {
    onMarketRoute: (destinationId) => {
      if (destinationId === location.id) return;
      navigation.selectDestination(destinationId);
      log.write('HANDEL > ROUTE ZUM VERKAUFSMARKT GESETZT');
      context.onReturnToStarMap();
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
  };
}

function buyShipAtShipyard(context: ActivePortContext, id: string): void {
  const next = getAllShipDefinitions().find((entry) => entry.id === id);
  if (!next || !context.port.shipyard) return;
  if (context.ownedShipIds.has(id)) {
    context.onChangeShip(next);
    return;
  }
  const price = Math.round(next.nominalLengthMeters * 12000);
  if (context.trade.player.credits < price) return;
  context.trade.player.credits -= price;
  context.ownedShipIds.add(id);
  context.log.write(`WERFT > ${next.name.toUpperCase()} GEKAUFT · -${price} CR`);
  context.onChangeShip(next);
}

function rollbackShipyardSwap(
  context: ActivePortContext,
  type: ShipComponentType,
  removedUid: string | null,
  selected: ReturnType<ShipComponentInventoryService['take']>
): void {
  const { componentInventory, runtime } = context;
  if (removedUid) componentInventory.take(removedUid);
  if (selected) {
    componentInventory.store(
      type,
      selected.componentId,
      selected.sourceWreckId,
      runtime.cargoCapacityTons,
      selected.source
    );
  }
}

function storeRemovedShipyardComponent(
  context: ActivePortContext,
  type: ShipComponentType,
  before: string | null
): ReturnType<ShipComponentInventoryService['store']> {
  if (!before) return null;
  return context.componentInventory.store(
    type,
    before,
    'removed-' + context.ship.id,
    context.runtime.cargoCapacityTons,
    'removed'
  );
}

function setShipyardComponentSlot(
  context: ActivePortContext,
  type: ShipComponentType,
  index: number,
  uid: string | null
): void {
  const { componentInventory, loadouts, ship, log, onRefresh } = context;
  const item = uid ? componentInventory.list().find((part) => part.uid === uid) : null;
  if (uid && (!item || item.type !== type)) return;
  const before = loadouts.get(ship)[type]?.[index] ?? null;
  if (before === (item?.componentId ?? null)) return;
  const selected = item ? componentInventory.take(item.uid) : null;
  if (item && !selected) return;
  const removed = storeRemovedShipyardComponent(context, type, before);
  if ((before && !removed) || !loadouts.setSlot(ship, type, index, item?.componentId ?? null)) {
    rollbackShipyardSwap(context, type, removed?.uid ?? null, selected);
    log.write('WERFT > EINBAU ABGEBROCHEN · KOMPONENTEN NICHT VERÄNDERT');
    return;
  }
  log.write(`WERFT > ${type.toUpperCase()} SLOT ${index + 1} AKTUALISIERT`);
  onRefresh();
}

function createShipyardCallbacks(
  context: ActivePortContext
): Pick<
  PortPanelOptions,
  'onSetComponentSlot' | 'onSellLooseComponent' | 'onBuyShipyardVariant' | 'onBuyShip'
> {
  const { componentInventory, shipyardResearch, trade, runtime, location, log, onRefresh } =
    context;

  return {
    onSetComponentSlot: (type, index, uid) => setShipyardComponentSlot(context, type, index, uid),
    onSellLooseComponent: (uid) => {
      const item = componentInventory.list().find((component) => component.uid === uid);
      if (!item) return;
      const appraisal = salvagedComponentAppraisal(item.type, item.componentId);
      const definition = getShipComponent(item.type, item.componentId);
      if (appraisal.sell <= 0 || !componentInventory.take(uid)) return;
      trade.player.credits += appraisal.sell;
      const learned = shipyardResearch.registerComponent(item.type, item.componentId);
      log.write(
        `WERFT > ${definition?.name ?? item.name} VERKAUFT · +${appraisal.sell} CR` +
          (learned ? ' · NEUER FERTIGUNGSSTANDARD FREIGESCHALTET' : '')
      );
      onRefresh();
    },
    onBuyShip: (id) => buyShipAtShipyard(context, id),
    onBuyShipyardVariant: (type, componentId) => {
      const definition = getShipComponent(type, componentId);
      const baseOffer = getCompatibleShipComponents(type, context.gameplay.maxComponentTier).some(
        (entry) => entry.id === componentId
      );
      const discovered = context.shipyardResearch
        .variants(type, context.gameplay.maxComponentTier)
        .some((entry) => entry.id === componentId);
      if (
        !definition ||
        (!baseOffer && !discovered) ||
        trade.player.credits < definition.cost ||
        definition.tier > context.gameplay.maxComponentTier
      )
        return;
      const stored = componentInventory.store(
        type,
        componentId,
        'shipyard-' + location.id,
        runtime.cargoCapacityTons,
        'purchased'
      );
      if (!stored) {
        log.write('WERFT > NICHT GENÜGEND FRACHTRAUM FÜR KOMPONENTE');
        return;
      }
      trade.player.credits -= definition.cost;
      log.write(`WERFT > ${definition.name.toUpperCase()} GEKAUFT · -${definition.cost} CR`);
      onRefresh();
    },
  };
}

function createCrewCallbacks(
  context: ActivePortContext
): Pick<PortPanelOptions, 'onHireCrew' | 'onAssignCrew'> {
  const { crew, ship, gameplay, log, onRefresh } = context;
  return {
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
  };
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
  componentInventory: ShipComponentInventoryService,
  shipyardResearch: ShipyardResearchService,
  currentDay: number,
  onReturnToStarMap: () => void,
  onRefresh: () => void,
  log: SystemLogService,
  ownedShipIds: Set<string>,
  onChangeShip: (ship: ShipDefinition) => void
): PortPanel | null {
  const locationId = navigation.getSnapshot().currentLocationId;
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  const port = locationId ? sectorPortByLocationId(locationId) : null;
  const market = locationId ? markets.getMarket(locationId) : null;
  if (!location || !port || !market) return null;

  marketIntel.observeLocation(location.id, currentDay);
  const installed = loadouts.get(ship);
  const runtime = resolveShipRuntimeSetup(ship, { ...crew.runtimeOptions(ship), installed });
  const gameplay = resolveShipGameplayStats(ship);
  navigation.setCruiseSpeed(
    ship.navigation.cruiseSpeed * runtime.crewEffects.piloting.travelSpeedMultiplier
  );

  const context: ActivePortContext = {
    location,
    port,
    market,
    navigation,
    trade,
    ship,
    crew,
    loadouts,
    marketIntel,
    componentInventory,
    shipyardResearch,
    ownedShipIds,
    onChangeShip,
    installed,
    runtime,
    gameplay,
    currentDay,
    onReturnToStarMap,
    onRefresh,
    log,
  };

  return createPortPanel({
    root,
    model: createActivePortModel(context),
    onReturnToStarMap,
    ...createTradeCallbacks(context),
    ...createShipyardCallbacks(context),
    ...createCrewCallbacks(context),
  });
}
