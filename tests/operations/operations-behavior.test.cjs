'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { BlockadeService } = load('src/systems/operations/blockade-service.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { PatrolCareerService } = load('src/systems/operations/patrol-career-service.ts');
const { narrowsSector: world } = load('src/data/maps/narrows-sector.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { createPlayerTradeService } = load('src/systems/economy/player-trade-service.ts');
const { createMiningEconomyService } = load('src/systems/economy/mining-economy-service.ts');
function fixture() {
  const ships = createSectorNpcEconomyStates();
  const markets = createEconomyMarketService(sectorPorts, economyResources);
  const trade = createPlayerTradeService(markets);
  trade.player.credits = 500000;
  const simulation = createEconomySimulationService(
    markets,
    trade.player,
    economyResources,
    41,
    ships
  );
  const sector = createNpcSectorService(world, ships, { markets });
  const notices = [];
  const blockades = new BlockadeService({
    sector,
    markets,
    player: trade.player,
    recordLoss: (id, amount) => {
      simulation.pools[id].recordedLosses += amount;
    },
    notice: (message) => notices.push(message),
  });
  return { ships, markets, trade, simulation, sector, notices, blockades };
}
function blockadeTest() {
  const f = fixture(),
    { blockades: b, markets, sector, trade, simulation } = f;
  const pirates = b.available().slice(0, 2);
  const target = markets
    .snapshot()
    .find((m) => m.needs.size && pirates.every((n) => sector.quoteTravel(n, m.locationId)));
  assert(target);
  const resource = [...target.needs][0];
  const ids = pirates.map((n) => n.id),
    before = trade.player.credits;
  const quote = b.quote(ids, 7);
  assert(quote > 0);
  assert.equal(b.order('player', target.locationId, resource, [ids[0], ids[0]], 7), false);
  assert.equal(trade.player.credits, before);
  assert(b.order('player', target.locationId, resource, ids, 7));
  assert.equal(trade.player.credits, before - quote);
  assert.equal(b.quote(ids, 7), null, 'exclusive assignments');
  assert.equal(b.snapshot().orders[0].startedDay, null);
  assert.equal(b.blocks(target.locationId, resource), false, 'no remote blockade');
  assert(
    pirates.some((n) => n.travel),
    'real route begins'
  );
  assert.equal(b.mayAttack(ids[0]), false, 'assembly ships keep their approach');
  let frames = 0;
  while (b.snapshot().orders[0].phase === 'assembling' && frames++ < 10000) {
    sector.tick(0.25);
    b.tick();
  }
  assert.equal(b.snapshot().orders[0].phase, 'active', 'all ships arrive physically');
  const snap = b.snapshot();
  snap.orders[0].pirateIds.length = 0;
  assert.equal(b.snapshot().orders[0].pirateIds.length, 2, 'detached snapshot');
  assert(b.blocks(target.locationId, resource));
  assert(!b.blocksTrader('player', target.locationId, resource));
  assert(b.blocksTrader('civilian', target.locationId, resource));
  const stock = markets.getEntry(target.locationId, resource).stock;
  const total = simulation.getResourceTotal(resource);
  b.advanceDay(1);
  const removed = b.snapshot().orders[0].removedStock;
  assert(removed > 0);
  assert.equal(markets.getEntry(target.locationId, resource).stock, stock - removed);
  assert.equal(
    simulation.getResourceTotal(resource) + removed,
    total,
    'explicit resource loss only'
  );
  assert.equal(simulation.pools[resource].recordedLosses, removed);
  const after = b.snapshot();
  b.advanceDay(1);
  assert.deepEqual(b.snapshot(), after);
  b.advanceDay(7);
  assert.equal(b.snapshot().orders[0].phase, 'completed');
  assert(!b.assigned(ids[0]));
  assert(!b.blocks(target.locationId, resource));
}
function failedAndNpcOrders() {
  const { blockades: b, ships, markets, sector, trade } = fixture();
  const pirate = b.available()[0],
    trader = ships.find((n) => n.job === 'freighter');
  const target = markets
    .snapshot()
    .find((m) => m.needs.size && sector.quoteTravel(pirate, m.locationId));
  const resource = [...target.needs][0];
  trade.player.credits = 0;
  const snap = b.snapshot();
  assert.equal(b.order('player', target.locationId, resource, [pirate.id], 10), false);
  assert.deepEqual(b.snapshot(), snap);
  assert.equal(pirate.travel, undefined);
  trader.credits = 100000;
  assert(b.order(trader.id, target.locationId, resource, [pirate.id], 10));
  assert(b.protectsOwner(pirate.id, trader.id));
  assert(!b.protectsPlayer(pirate.id));
  pirate.hullHp = 0;
  b.tick();
  assert.equal(b.snapshot().orders[0].phase, 'defeated');
  assert(!b.assigned(pirate.id));
}
function miningTest() {
  const claims = new AsteroidClaimRegistry();
  const mkRock = (id) => ({
    id, kind: 'resource', scanLevel: 'analyzed',
    deposits: [{ resourceId: 'ferrite', oreRemaining: 75, oreCapacity: 100, identified: true }]
  });
  const asteroid = mkRock('asteroid-17-3');
  assert.equal(claims.register('field-a', { ...asteroid, scanLevel: 'unscanned' }, 'player', 1, 10000).ok, false);
  assert.equal(claims.register('field-a', asteroid, 'player', 1, 0).ok, false);
  assert.deepEqual(claims.register('field-a', asteroid, 'player', 1, 10000), { ok: true, fee: 2500 });
  assert.equal(claims.register('field-a', asteroid, 'competitor', 1, 10000).ok, false);
  assert.equal(claims.claim('field-a', asteroid).ownerId, 'player');
  const sameFieldSeed = claims.seedFor('field-a', () => 17);
  assert.equal(claims.seedFor('field-a', () => 999), sameFieldSeed);
  assert.equal(claims.seedFor('field-b', () => 23), 23);
  claims.rememberField('field-a', [asteroid]);
  const regenerated = mkRock('asteroid-17-3');
  regenerated.deposits[0].oreRemaining = 100;
  regenerated.scanLevel = 'unscanned';
  claims.restoreField('field-a', [regenerated]);
  assert.equal(regenerated.deposits[0].oreRemaining, 75);
  assert.equal(regenerated.scanLevel, 'analyzed');
  assert.equal(claims.recordTheft('field-a', asteroid.id, 'pirate', 5, false, 100), null);
  const caught = claims.recordTheft('field-a', asteroid.id, 'pirate', 5, true, 100);
  assert.equal(caught.compensation, 750);
  assert.equal(claims.resolveConflict('field-a', asteroid.id, 'pirate', 'paid').status, 'paid');
  const second = claims.recordTheft('field-a', asteroid.id, 'other-miner', 7, true, 80);
  assert.equal(second.compensation, 840);
  assert.equal(claims.snapshot().conflicts.length, 2,
    'A different intruder must not overwrite the first offender');
  const loaded = new AsteroidClaimRegistry();
  assert(loaded.restoreState(JSON.parse(JSON.stringify(claims.exportState()))));
  assert.equal(loaded.claim('field-a', asteroid).ownerId, 'player');
  assert.equal(loaded.seedFor('field-a', () => 999), 17);
  const persistedRock = mkRock('asteroid-17-3');
  persistedRock.scanLevel = 'unscanned';
  persistedRock.deposits[0].oreRemaining = 100;
  loaded.restoreField('field-a', [persistedRock]);
  assert.equal(persistedRock.deposits[0].oreRemaining, 75);
  assert.equal(persistedRock.scanLevel, 'analyzed');
  assert.equal(loaded.snapshot().conflicts.length, 2);
  assert.equal(claims.abandon('field-a', asteroid.id, 'pirate'), false);
  assert.equal(claims.abandon('field-a', asteroid.id, 'player'), true);
  assert.equal(claims.claim('field-a', asteroid), null);
}
function patrolTest() {
  const { ships, trade } = fixture();
  const patrol = new PatrolCareerService(world, ships, trade.player);
  const ports = world.locations.filter(
    (l) => l.activities.trade && l.activities.dock && l.stationType !== 'pirate'
  );
  assert.equal(patrol.enlist('invalid'), false);
  assert(patrol.enlist(ports[0].id));
  assert(patrol.accept('route', ports[1].id, ports[0].id));
  patrol.observeArrival(ports[1].id, 0.25);
  assert.equal(patrol.snapshot().assignments[0].status, 'active');
  for (let i = 0; i < 48; i++) patrol.observeArrival(ports[1].id, 0.25);
  assert.equal(patrol.snapshot().assignments[0].status, 'completed');
  const before = trade.player.credits;
  assert.equal(patrol.claimReward(ports[1].id), 800);
  assert.equal(trade.player.credits, before + 800);
  assert.equal(patrol.claimReward(ports[1].id), 0);
  const pirate = ships.find((n) => n.pirate);
  assert(patrol.accept('bounty', pirate.id, ports[0].id));
  patrol.recordVictory('wrong-target');
  assert.equal(patrol.claimReward(ports[0].id), 0);
  patrol.recordVictory(pirate.id);
  assert(patrol.claimReward(ports[0].id) > 0);
  const snap = patrol.snapshot();
  snap.assignments[0].visited.push('fake');
  assert(!patrol.snapshot().assignments[0].visited.includes('fake'));
  patrol.recordAttack(ships.find((n) => n.job === 'freighter'));
  assert.equal(patrol.snapshot().mandate, false);
  assert.equal(patrol.enlist(ports[0].id), false);
}
blockadeTest();
failedAndNpcOrders();
miningTest();
patrolTest();
console.log(
  'PASS operations: physical deployment, exclusivity, losses, asteroid claims, patrol completion and detached snapshots'
);
