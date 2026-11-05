'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const decisions = load('src/systems/economy/npc-operating-decisions.ts');
const actions = load('src/systems/economy/npc-trade-actions.ts');
const operating = load('src/systems/npcs/npc-operating-policy.ts');

const npc = {
  id: 'economic-freighter',
  role: 'freighter',
  locationId: 'origin',
  credits: 1000,
  cargoCapacity: 10,
  cargo: {},
  workResourceIds: [],
  marketIntel: {
    near: {
      locationId: 'near',
      observedDay: 0,
      entries: { steel: { resourceId: 'steel', price: 150, stock: 100 } },
    },
    far: {
      locationId: 'far',
      observedDay: 0,
      entries: { steel: { resourceId: 'steel', price: 170, stock: 100 } },
    },
  },
};
const resources = [
  {
    id: 'steel',
    name: 'Steel',
    legality: 'legal',
    categoryId: 'industry',
    category: 'Industry',
    basePrice: 100,
  },
];
const origin = { resourceId: 'steel', stock: 100, price: 100, demand: 0.5 };
const markets = {
  getMarket(id) {
    return id === 'origin' ? { locationId: 'origin', entries: { steel: origin } } : null;
  },
  getEntry(id, resource) {
    return id === 'origin' && resource === 'steel' ? origin : null;
  },
};
const positions = {
  origin: { x: 0, y: 0 },
  near: { x: 100, y: 0 },
  far: { x: 600, y: 0 },
};
const quote = (_ship, destination, credits) => {
  if (credits < 0) return null;
  if (destination === 'near') {
    return { distance: 100, fuelExpense: 50, refuelCost: 0 };
  }
  if (destination === 'far') {
    return { distance: 600, fuelExpense: 350, refuelCost: 0 };
  }
  return null;
};

const affordable = (_ship, _destination, credits) =>
  credits >= 200 ? { distance: 100, fuelExpense: 50, refuelCost: 200 } : null;
assert.equal(decisions.maxAffordableShipment(npc, 'near', 10, 100, affordable), 8);
assert.equal(decisions.maxAffordableShipment(npc, 'near', 10, 100), 10);
const candidate = decisions.evaluateNpcPurchaseVoyage(npc, 'near', 10, 100, 150, 100, affordable);
assert.equal(candidate.quantity, 8);
assert.equal(candidate.netProfit, 350);
assert.equal(
  decisions.evaluateNpcPurchaseVoyage(
    npc,
    'far',
    10,
    100,
    150,
    600,
    () => ({ distance: 600, fuelExpense: 1000, refuelCost: 0 })
  ),
  null,
  'a nominally profitable trade must not survive operating costs'
);
assert.equal(
  decisions.evaluateNpcPurchaseVoyage(npc, 'near', 10, 100, 150, 100, () => null),
  null,
  'an impossible paid fuel itinerary must not be selected'
);

actions.chooseTraderAction(npc, markets, resources, positions, 0, quote);
assert.equal(npc.autonomy.pendingTrade.destinationId, 'near');
assert.equal(npc.autonomy.pendingTrade.quantity, 10);
assert.equal(npc.autonomy.phase, 'loading');

const poor = {
  ...npc,
  id: 'unprofitable',
  cargo: {},
  autonomy: undefined,
};
actions.chooseTraderAction(
  poor,
  markets,
  resources,
  positions,
  0,
  () => ({ distance: 10, fuelExpense: 99999, refuelCost: 0 })
);
assert.equal(poor.autonomy.pendingTrade, undefined);
assert.equal(poor.autonomy.phase, 'resting');

const worker = {
  id: 'worker-return',
  role: 'miner',
  locationId: 'work',
  homePortId: 'home',
  workLocationId: 'work',
  workResourceIds: ['steel'],
  credits: 1000,
  cargoCapacity: 10,
  cargo: {},
  hullHp: 35,
  hullMaxHp: 100,
};
const homewardQuote = (_ship, destination) => {
  if (destination !== 'home') return null;
  return { distance: 100, fuelExpense: 20, refuelCost: 0 };
};
actions.chooseWorkerAction(worker, markets, resources, positions, 0, homewardQuote);
assert.equal(worker.autonomy.pendingDestinationId, 'home');
assert.equal(worker.autonomy.pendingReason, 'Notwendige Hüllenreparatur');
assert.equal(worker.autonomy.phase, 'launch-prep');
assert.equal(operating.npcNeedsSafeReturn(worker), true);
assert.equal(operating.npcNeedsSafeReturn({}), false);

const limited = { hullHp: 90, hullMaxHp: 100, fuelCapacity: 100, credits: 500 };
assert.equal(operating.npcRepairPriority(limited, false), 'defer');
limited.credits = 5000;
assert.equal(operating.npcRepairPriority(limited, false), 'affordable');
limited.hullHp = 20;
limited.credits = 100;
assert.equal(operating.npcRepairPriority(limited, false), 'critical');

console.log('PASS NPC net-trading decisions, cargo liquidity, worker retreat and repair priorities');
