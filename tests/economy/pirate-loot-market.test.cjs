'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { sellPirateLootAtHome } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/pirate-loot-market.ts'
);

const market = {
  stock: 5,
  demand: 0.5,
  price: 100,
};
let recalculations = 0;
const markets = {
  getEntry: (locationId, resourceId) =>
    locationId === 'blackjaw-outpost' && resourceId === 'ore' ? market : null,
  recalculate() {
    recalculations += 1;
  },
};
const base = {
  pirate: true,
  factionId: 'pirates',
  locationId: 'blackjaw-outpost',
  credits: 200,
  cargo: { ore: 4, unknown: 2 },
};
const pirate = { ...base, cargo: { ...base.cargo } };
assert.deepEqual(sellPirateLootAtHome(pirate, markets), { units: 4, revenue: 260 });
assert.equal(pirate.credits, 460);
assert.equal(pirate.cargo.ore, undefined);
assert.equal(pirate.cargo.unknown, 2);
assert.equal(market.stock, 9);
assert.equal(recalculations, 1);
assert.equal(pirate.pirateLootRevenue, 260);
assert.equal(pirate.pirateLootUnitsSold, 4);
assert.deepEqual(sellPirateLootAtHome(pirate, markets), { units: 0, revenue: 0 });
assert.equal(pirate.credits, 460, 'goods cannot be sold twice');
const away = { ...base, locationId: 'elsewhere', cargo: { ...base.cargo } };
assert.equal(sellPirateLootAtHome(away, markets).units, 0);
assert.equal(away.credits, 200);
const civilian = { ...base, pirate: false, cargo: { ...base.cargo } };
assert.equal(sellPirateLootAtHome(civilian, markets).units, 0);
assert.equal(civilian.credits, 200);
console.log('PASS pirate loot is sold once, transferred to market and credited only at gang base');
