import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import { economyResourceById } from '../data/economy/economy-resources';
import { narrowsSector } from '../data/maps/narrows-sector';
import { sectorPortByLocationId } from '../data/ports/sector-ports';
import { createPortViewModel } from '../features/port/port-view-model';
import { createPortRegistrationOptions } from './game-controller-port-registration';
import type { SectorLegalRegistry } from '../systems/operations/sector-legal-registry';
import { systemMarketRows } from './game-controller-port-market';
import type { ShipOperatingService } from '../systems/ships/ship-operating-costs';
import { portOperatingView } from './game-controller-port-operating';
import type { EconomyMarketService } from '../systems/economy/market-service';
import type { MarketIntelService } from '../systems/economy/market-intel-service';
import type { PlayerTradeService } from '../systems/economy/player-trade-service';
import type { SmugglingService } from '../systems/economy/smuggling-service';
import type { TradeCharterService, TradeCharterId } from '../systems/economy/trade-charter-service';
import { createSmugglingPortOptions } from './game-controller-port-smuggling';
import { createCrewMember, crewCapacity, type CrewRosterService } from '../systems/crew';
import type { NavigationService } from '../systems/navigation';
import {
  canShipCarryResource,
  resolveShipGameplayStats,
  resolveShipRuntimeSetup,
  getShipComponent,
  engineSpeedMultiplier,
  getAllShipDefinitions,
  getCompatibleShipComponents,
  shipCanFitWeapon,
  shipPurchasePrice,
  shipActivationBlock,
  type ShipOwnershipService,
  type ShipComponentInventoryService,
  type ShipLoadoutService,
  type ShipyardResearchService,
} from '../systems/ships';
import { createPortPanel, type PortPanel } from '../ui/port/port-panel';
import {
  installShipyardComponent,
  purchaseShipyardComponent,
  sellShipyardComponent,
  type ShipyardTransactionContext,
} from '../systems/ships/shipyard-component-transactions';

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
  readonly smuggling: SmugglingService;
  readonly charters: TradeCharterService;
  readonly ship: ShipDefinition;
  readonly crew: CrewRosterService;
  readonly loadouts: ShipLoadoutService;
  readonly marketIntel: MarketIntelService;
  readonly componentInventory: ShipComponentInventoryService;
  readonly shipyardResearch: ShipyardResearchService;
  readonly shipOwnership: ShipOwnershipService;
  readonly shipOperations: ShipOperatingService;
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
    'armor',
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
      stationSkills: runtime.stationSkills,
      effects: runtime.crewEffects,
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
    runtime.cargoCapacityTons - context.smuggling.normalPenalty(ship.id),
    context.charters.saleFeeRate(runtime.crewEffects.logistics.saleFeeRate),
    {
      loose: context.componentInventory.list(),
      variants: shipyardTypes.flatMap((type) =>
        context.shipyardResearch
          .variants(type, type === 'armor' ? 6 : gameplay.maxComponentTier)
          .filter(
            (component) =>
              type !== 'weapon' || (component.weapon && shipCanFitWeapon(ship, component.weapon))
          )
      ),
      catalog: shipyardTypes.flatMap((type) =>
        [
          ...getCompatibleShipComponents(type, type === 'armor' ? 6 : gameplay.maxComponentTier),
          ...context.shipyardResearch.variants(
            type,
            type === 'armor' ? 6 : gameplay.maxComponentTier
          ),
        ].filter(
          (component) =>
            type !== 'weapon' || (component.weapon && shipCanFitWeapon(ship, component.weapon))
        )
      ),
      ships: getAllShipDefinitions().map((offer) => ({
        id: offer.id,
        name: offer.name,
        role: offer.role,
        price: shipPurchasePrice(offer),
        owned: context.shipOwnership.owns(offer.id),
        active: ship.id === offer.id,
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
    },
    portOperatingView(ship, runtime, port, context.shipOperations),
    context.charters
  );
}

function createTradeCallbacks(
  context: ActivePortContext
): Pick<PortPanelOptions, 'onMarketRoute' | 'onBuy' | 'onSell' | 'onSellAll'> {
  const { navigation, trade, ship, marketIntel, location, currentDay, runtime, log, onRefresh } =
    context;
  const saleFeeRate = context.charters.saleFeeRate(runtime.crewEffects.logistics.saleFeeRate);

  return {
    onMarketRoute: (destinationId) => {
      if (destinationId === location.id) return;
      navigation.selectDestination(destinationId);
      log.write('HANDEL > ROUTE ZUM VERKAUFSMARKT GESETZT');
      context.onReturnToStarMap();
    },
    onBuy: (resourceId) => {
      if (!context.charters.mayTrade()) {
        log.write('HANDEL > EIN GÜLTIGES HANDELSMANDAT IST ERFORDERLICH');
        return;
      }
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
      if (!context.charters.mayTrade()) return;
      const result = trade.sell(location.id, resourceId, 1, saleFeeRate);
      if (!result) return;
      const protectionFee = context.smuggling.recordSale(resourceId, result.creditsDelta);
      if (protectionFee) log.write('SCHMUGGEL > SCHUTZABGABE -' + protectionFee + ' CR');
      marketIntel.observeLocation(location.id, currentDay);
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > -${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
    onSellAll: (resourceId) => {
      if (!context.charters.mayTrade()) return;
      const quantity = trade.player.cargo[resourceId]?.qty ?? 0;
      const result = trade.sell(location.id, resourceId, quantity, saleFeeRate);
      if (!result) return;
      const protectionFee = context.smuggling.recordSale(resourceId, result.creditsDelta);
      if (protectionFee) log.write('SCHMUGGEL > SCHUTZABGABE -' + protectionFee + ' CR');
      marketIntel.observeLocation(location.id, currentDay);
      const name = economyResourceById(resourceId)?.name ?? resourceId;
      log.write(
        `HANDEL > ALLES VERKAUFT · ${result.quantity} ${name.toUpperCase()} · +${result.creditsDelta} CR · P/L ${result.realizedProfit}`
      );
      onRefresh();
    },
  };
}

function createCharterCallbacks(
  context: ActivePortContext
): Pick<PortPanelOptions, 'onJoinCharter' | 'onLeaveCharter'> {
  const { charters, log, onRefresh } = context;
  return {
    onJoinCharter: (id: TradeCharterId) => {
      const cost = charters.join(id);
      if (cost === null) log.write('HANDEL > MANDAT ABGELEHNT: GELD ODER MITGLIEDSCHAFT');
      else log.write('HANDEL > NEUES MANDAT · -' + cost + ' CR');
      onRefresh();
    },
    onLeaveCharter: () => {
      if (charters.leave()) log.write('HANDEL > MANDAT GEKÜNDIGT · KEINE ERSTATTUNG');
      onRefresh();
    },
  };
}

function activateShipAtShipyard(context: ActivePortContext, ship: ShipDefinition): void {
  if (context.ship.id === ship.id) return;
  if (context.smuggling.hiddenUsed() > 0) {
    context.log.write('WERFT > SCHIFFSWECHSEL ERFORDERT LEEREN DES VERDECKTEN FRACHTRAUMS');
    return;
  }
  const blocked = shipActivationBlock(
    ship,
    context.shipOwnership,
    context.trade,
    context.crew,
    context.loadouts,
    context.ship
  );
  if (blocked) {
    const explanation: Record<Exclude<typeof blocked, null>, string> = {
      'not-owned': 'SCHIFF NICHT IN BESITZ',
      'cargo-overflow': 'FRACHT ÜBERSCHREITET NEUE KAPAZITÄT',
      'cargo-incompatible': 'FRACHT NICHT FÜR NEUEN SCHIFFSTYP GEEIGNET',
      'crew-overflow': 'ZU VIELE CREWMITGLIEDER FÜR NEUE KOJEN',
    };
    context.log.write('WERFT > WECHSEL ABGELEHNT · ' + explanation[blocked]);
    context.onRefresh();
    return;
  }
  context.log.write('WERFT > SCHIFF GEWECHSELT · ' + ship.name.toUpperCase());
  context.smuggling.activateShip(ship.id);
  context.onChangeShip(ship);
}

function buyShipAtShipyard(context: ActivePortContext, id: string): void {
  const next = getAllShipDefinitions().find((entry) => entry.id === id);
  if (!next || !context.port.shipyard) return;
  if (!context.shipOwnership.owns(id)) {
    const price = context.shipOwnership.purchase(id);
    if (price === null) {
      context.log.write('WERFT > KAUF ABGELEHNT · UNGENÜGEND CREDITS ODER UNGÜLTIGES MODELL');
      return;
    }
    context.log.write(`WERFT > ${next.name.toUpperCase()} GEKAUFT · -${price} CR`);
  }
  activateShipAtShipyard(context, next);
}

function shipyardTransactions(context: ActivePortContext): ShipyardTransactionContext {
  return {
    ship: context.ship,
    trade: context.trade,
    inventory: context.componentInventory,
    loadouts: context.loadouts,
    research: context.shipyardResearch,
    cargoCapacityTons: context.runtime.cargoCapacityTons,
    locationId: context.location.id,
  };
}

function createShipyardCallbacks(
  context: ActivePortContext
): Pick<
  PortPanelOptions,
  'onSetComponentSlot' | 'onSellLooseComponent' | 'onBuyShipyardVariant' | 'onBuyShip'
> {
  const { log, onRefresh } = context;
  return {
    onSetComponentSlot: (type, index, uid) => {
      if (!installShipyardComponent(shipyardTransactions(context), type, index, uid)) {
        log.write('WERFT > EINBAU ABGEBROCHEN · KOMPONENTEN NICHT VERÄNDERT');
        return;
      }
      log.write(`WERFT > ${type.toUpperCase()} SLOT ${index + 1} AKTUALISIERT`);
      onRefresh();
    },
    onSellLooseComponent: (uid) => {
      const result = sellShipyardComponent(shipyardTransactions(context), uid);
      if (!result) return;
      log.write(
        `WERFT > ${result.name.toUpperCase()} VERKAUFT · +${result.credits} CR` +
          (result.researched ? ' · NEUER FERTIGUNGSSTANDARD FREIGESCHALTET' : '')
      );
      onRefresh();
    },
    onBuyShip: (id) => buyShipAtShipyard(context, id),
    onBuyShipyardVariant: (type, componentId) => {
      if (!purchaseShipyardComponent(shipyardTransactions(context), type, componentId)) {
        log.write('WERFT > KAUF ABGEBROCHEN · CREDITS, FRACHTRAUM ODER FREIGABE PRÜFEN');
        return;
      }
      const name = getShipComponent(type, componentId)?.name ?? componentId;
      const cost = getShipComponent(type, componentId)?.cost ?? 0;
      log.write(`WERFT > ${name.toUpperCase()} GEKAUFT · -${cost} CR`);
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

function repairShipAtPort(context: ActivePortContext): void {
  const { shipOperations, ship, runtime, port, log, onRefresh } = context;
  const result = shipOperations.repair(
    ship,
    runtime.hullMaxHp,
    port.shipyard,
    runtime.crewEffects.engineering.repairCostMultiplier
  );
  if (result.points > 0) {
    log.write('WERFT > HÜLLE +' + result.points + ' HP · ' + result.cost + ' CR');
  } else {
    log.write('WARTUNG > REPARATUR NICHT NÖTIG ODER NICHT BEZAHLBAR');
  }
  onRefresh();
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
  shipOwnership: ShipOwnershipService,
  onChangeShip: (ship: ShipDefinition) => void,
  shipOperations: ShipOperatingService,
  smuggling: SmugglingService,
  charters?: TradeCharterService,
  legal?: SectorLegalRegistry
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
  const drive = engineSpeedMultiplier(runtime.installed);
  navigation.setCruiseSpeed(
    ship.navigation.cruiseSpeed * drive * runtime.crewEffects.piloting.travelSpeedMultiplier,
    drive * runtime.crewEffects.piloting.turnRateMultiplier
  );

  if (!charters) throw new Error('Trade charter service required for port commerce');
  const context: ActivePortContext = {
    location,
    port,
    market,
    navigation,
    trade,
    smuggling,
    charters,
    ship,
    crew,
    loadouts,
    marketIntel,
    componentInventory,
    shipyardResearch,
    shipOwnership,
    shipOperations,
    onChangeShip,
    installed,
    runtime,
    gameplay,
    currentDay,
    onReturnToStarMap,
    onRefresh,
    log,
  };

  const underworldOptions = createSmugglingPortOptions(
    smuggling,
    trade,
    ship,
    location.id,
    runtime.cargoCapacityTons,
    currentDay,
    log,
    onRefresh
  );
  return createPortPanel({
    root,
    ...createPortRegistrationOptions(
      createActivePortModel(context),
      ship,
      location.stationType === 'pirate',
      trade,
      log,
      onRefresh,
      legal
    ),
    ...underworldOptions,
    onReturnToStarMap,
    onRepairShip: () => repairShipAtPort(context),
    ...createTradeCallbacks(context),
    ...createCharterCallbacks(context),
    ...createShipyardCallbacks(context),
    ...createCrewCallbacks(context),
  });
}
