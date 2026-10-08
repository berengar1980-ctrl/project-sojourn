'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const npcModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/npc-economy-service.ts'
);
const autonomyModule = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-autonomy.ts');

const resources = [
  {
    id: 'steel',
    name: 'Stahl',
    categoryId: 'industry',
    category: 'Industrie',
    basePrice: 40,
    legality: 'legal',
  },
  {
    id: 'ferrite',
    name: 'Ferrit',
    categoryId: 'raw',
    category: 'Rohstoffe',
    basePrice: 30,
    legality: 'legal',
  },
];

function market(locationId, steelPrice, ferritePrice = 30) {
  return {
    locationId,
    produces: new Set(),
    needs: new Set(['steel', 'ferrite']),
    entries: {
      steel: {
        resourceId: 'steel',
        stock: 500,
        demand: 0.5,
        production: 0,
        price: steelPrice,
      },
      ferrite: {
        resourceId: 'ferrite',
        stock: 500,
        demand: 0.5,
        production: 0,
        price: ferritePrice,
      },
    },
  };
}

function createMarkets(entries) {
  const markets = entries;
  return {
    markets,
    snapshot() {
      return markets;
    },
    getMarket(locationId) {
      return markets.find((candidate) => candidate.locationId === locationId) ?? null;
    },
    getEntry(locationId, resourceId) {
      return this.getMarket(locationId)?.entries[resourceId] ?? null;
    },
    recalculate(locationId, resourceId) {
      return this.getEntry(locationId, resourceId)?.price ?? null;
    },
  };
}

const allocator = {
  createMinedResource(_resourceId, amount) {
    return amount;
  },
  allocatePhysicalResource(_resourceId, amount) {
    return amount;
  },
};

function tickFor(service, seconds) {
  const ticks = Math.ceil(seconds / 0.25);
  for (let index = 0; index < ticks; index += 1) service.tick(0.25);
}

function tickUntil(service, predicate, message, maximumTicks = 3000) {
  for (let index = 0; index < maximumTicks; index += 1) {
    if (predicate()) return index;
    service.tick(0.25);
  }
  assert(predicate(), message);
  return maximumTicks;
}

{
  const markets = createMarkets([market('source', 40), market('destination', 110)]);
  const trader = {
    id: 'timed-trader',
    role: 'trader',
    locationId: 'source',
    credits: 5000,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: [],
    personality: {
      riskTolerance: 0.5,
      patience: 0.5,
      profitDrive: 0.7,
      routineBias: 0.4,
    },
  };
  let travelling = false;
  let requestedDestination = null;
  const service = npcModule.createNpcEconomyService(markets, allocator, resources, [trader], {
    positions: {
      source: { x: 0, y: 0 },
      destination: { x: 100, y: 0 },
    },
    travel: {
      requestTravel(_npc, destinationId) {
        requestedDestination = destinationId;
        travelling = true;
        return true;
      },
      isTravelling() {
        return travelling;
      },
    },
  });

  assert.equal(trader.autonomy.phase, 'resting');
  tickFor(service, 3);
  assert.equal(requestedDestination, null, 'NPC must not depart immediately after becoming idle');
  assert.equal(trader.cargo.steel, undefined, 'NPC must not load immediately');

  const ticksToDeparture = tickUntil(
    service,
    () => requestedDestination !== null,
    'NPC must eventually think, load and prepare for launch'
  );
  assert(ticksToDeparture > 20, 'departure must require a visible multi-phase delay');
  assert.equal(requestedDestination, 'destination');
  assert.equal(trader.cargo.steel, 10);

  travelling = false;
  trader.locationId = 'destination';
  requestedDestination = null;
  service.tick(0.25);
  assert.equal(trader.autonomy.phase, 'docking');
  assert.equal(trader.cargo.steel, 10, 'arrival must not sell cargo before docking');

  tickFor(service, 2);
  assert.equal(trader.cargo.steel, 10, 'minimum docking time must block instant unloading');

  tickUntil(
    service,
    () => trader.cargo.steel === undefined,
    'cargo must unload only after docking, rest and decision phases'
  );
}

{
  const markets = createMarkets([market('source', 40), market('close', 100), market('far', 110)]);
  const cautious = {
    id: 'cautious-captain',
    role: 'trader',
    locationId: 'source',
    credits: 5000,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: [],
    personality: {
      riskTolerance: 0,
      patience: 1,
      profitDrive: 0,
      routineBias: 0,
      preferredMarketId: 'close',
    },
  };
  const aggressive = {
    id: 'profit-captain',
    role: 'trader',
    locationId: 'source',
    credits: 5000,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: [],
    personality: {
      riskTolerance: 1,
      patience: 0,
      profitDrive: 1,
      routineBias: 0,
      preferredMarketId: 'far',
    },
  };
  const positions = {
    source: { x: 0, y: 0 },
    close: { x: 100, y: 0 },
    far: { x: 10000, y: 0 },
  };
  const service = npcModule.createNpcEconomyService(
    markets,
    allocator,
    resources,
    [cautious, aggressive],
    { positions }
  );

  autonomyModule.beginNpcAutonomyPhase(cautious, 'ready', 0);
  autonomyModule.beginNpcAutonomyPhase(aggressive, 'ready', 0);
  service.tick(0.25);

  assert.equal(
    cautious.autonomy.pendingTrade.destinationId,
    'close',
    'cautious low-profit-drive captain should prefer the safer nearby route'
  );
  assert.equal(
    aggressive.autonomy.pendingTrade.destinationId,
    'far',
    'risk-tolerant profit-driven captain should accept the longer higher-margin route'
  );
  assert(
    autonomyModule.npcAutonomyPhaseDuration(cautious, 'thinking') >
      autonomyModule.npcAutonomyPhaseDuration(aggressive, 'thinking'),
    'patient captains must spend longer in deliberation than impatient captains'
  );
}

{
  const markets = createMarkets([market('source', 80, 100), market('work', 80, 30)]);
  const miner = {
    id: 'worker-state-machine',
    role: 'miner',
    locationId: 'source',
    credits: 2000,
    cargoCapacity: 10,
    normalCargoCapacity: 4,
    cargo: {},
    workResourceIds: ['ferrite'],
    workLocationId: 'work',
    personality: {
      riskTolerance: 0.4,
      patience: 0.4,
      profitDrive: 0.5,
      routineBias: 0.5,
    },
  };
  let travelling = false;
  let destination = null;
  const service = npcModule.createNpcEconomyService(markets, allocator, resources, [miner], {
    positions: {
      source: { x: 0, y: 0 },
      work: { x: 100, y: 0 },
    },
    travel: {
      requestTravel(_npc, destinationId) {
        destination = destinationId;
        travelling = true;
        return true;
      },
      isTravelling() {
        return travelling;
      },
    },
  });

  autonomyModule.beginNpcAutonomyPhase(miner, 'ready', 0);
  service.tick(0.25);
  assert.equal(miner.autonomy.phase, 'launch-prep');

  tickUntil(service, () => destination === 'work', 'worker must launch toward its work area');
  travelling = false;
  miner.locationId = 'work';
  destination = null;
  service.tick(0.25);
  assert.equal(miner.autonomy.phase, 'docking');

  tickUntil(
    service,
    () => miner.autonomy.phase === 'working',
    'worker must reach shared working phase only after arrival dwell and thinking'
  );

  service.mineLocal(miner, 'ferrite', 10);
  assert.equal(miner.cargo.ferrite, 10);
  assert.equal(service.dispatchLoadedWorker(miner), true);
  assert.equal(miner.autonomy.phase, 'thinking');
  assert.equal(destination, null, 'full worker must not instantly depart local space');

  tickUntil(
    service,
    () => destination === 'source',
    'full worker must think and prepare before travelling to a sale market'
  );
}


{
  const markets = createMarkets([market('source', 50), market('work', 50)]);
  const riskyMiner = {
    id: 'risk-personality-miner',
    role: 'miner',
    locationId: 'source',
    credits: 1000,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: ['ferrite'],
    workLocationId: 'work',
    workRiskPreference: 'safe',
    personality: {
      riskTolerance: 0.95,
      patience: 0.2,
      profitDrive: 0.4,
      routineBias: 0.3,
      preferredMarketId: 'source',
    },
  };
  npcModule.createNpcEconomyService(markets, allocator, resources, [riskyMiner]);
  assert.equal(
    riskyMiner.workRiskPreference,
    'risky',
    'persistent personality risk tolerance must drive worker event risk preference'
  );
}

{
  const markets = createMarkets([market('station', 50), market('patrol-target', 50)]);
  const patrol = {
    id: 'patrol-rest-test',
    role: 'patrol',
    locationId: 'station',
    credits: 1000,
    cargoCapacity: 4,
    cargo: {},
    workResourceIds: [],
    personality: {
      riskTolerance: 0.8,
      patience: 0.3,
      profitDrive: 0.2,
      routineBias: 0.5,
    },
  };
  let patrolRequests = 0;
  let travelling = false;
  const service = npcModule.createNpcEconomyService(markets, allocator, resources, [patrol], {
    travel: {
      requestTravel() {
        return false;
      },
      requestPatrol() {
        patrolRequests += 1;
        travelling = true;
        return true;
      },
      isTravelling() {
        return travelling;
      },
    },
  });

  assert.equal(patrol.autonomy.phase, 'patrol-rest');
  tickFor(service, 5);
  assert.equal(patrolRequests, 0, 'patrol must visibly rest before receiving a new route');

  tickUntil(service, () => patrolRequests === 1, 'patrol must eventually begin a new route');
  assert.equal(patrol.autonomy.phase, 'travel');

  travelling = false;
  patrol.locationId = 'patrol-target';
  service.tick(0.25);
  assert.equal(patrol.autonomy.phase, 'docking');
  tickFor(service, 5);
  assert.equal(patrolRequests, 1, 'arriving patrol must not immediately depart again');
  tickUntil(
    service,
    () => patrolRequests === 2,
    'patrol must resume only after its next rest phase'
  );
}


{
  const sectorSource = fs.readFileSync(
    path.join(root, 'src/systems/npcs/npc-sector-service.ts'),
    'utf8'
  );
  const economySource = fs.readFileSync(
    path.join(root, 'src/app/game-controller-economy.ts'),
    'utf8'
  );
  assert(
    sectorSource.includes('requestPatrol(npc)') &&
      economySource.includes('requestPatrol: (npc) => sectorNpcs.requestPatrol'),
    'sector service must expose patrol requests through autonomy'
  );
  assert(
    !sectorSource.includes(
      "if (npc.job === 'patrol') {\n            const target = patrolDestination"
    ),
    'sector tick must not auto-launch idle patrols behind the autonomy state machine'
  );
}


{
  const miningSource = fs.readFileSync(
    path.join(root, 'src/systems/npcs/npc-local-mining-service.ts'),
    'utf8'
  );
  const salvageSource = fs.readFileSync(
    path.join(root, 'src/systems/npcs/npc-local-salvage-service.ts'),
    'utf8'
  );
  assert(
    miningSource.includes("npc.autonomy?.phase === 'working'") &&
      salvageSource.includes("npc.autonomy?.phase === 'working'"),
    'local worker services must require the shared working autonomy phase'
  );
}

console.log('PASS NPC autonomy: dwell, thinking, personality, worker lifecycle and patrol rest');
