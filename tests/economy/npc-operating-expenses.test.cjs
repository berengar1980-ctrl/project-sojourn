'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const { chargeNpcDailyOperatingExpenses } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/economy/npc-operating-expenses.ts'
);
function npc(credits, role = 'freighter') {
  return { role, credits, cargoCapacity: 900, lastOperatingChargeDay: 0 };
}

const trader = npc(10000);
const charged = chargeNpcDailyOperatingExpenses(trader, 1);
assert(charged > 0);
assert.equal(trader.credits, 10000 - charged);
assert.equal(trader.civilianOperatingExpenses, charged);
assert.equal(chargeNpcDailyOperatingExpenses(trader, 1), 0, 'day must not be charged twice');
assert.equal(chargeNpcDailyOperatingExpenses(trader, 0), 0);
assert.equal(chargeNpcDailyOperatingExpenses(trader, 3), 2 * charged, 'missed days must settle');
assert.equal(trader.civilianOperatingExpenses, charged * 3);

const poor = npc(10, 'miner');
assert.equal(chargeNpcDailyOperatingExpenses(poor, 1), 10);
assert.equal(poor.credits, 0);
assert.equal(chargeNpcDailyOperatingExpenses(poor, 1), 0);
poor.credits = 40;
assert.equal(chargeNpcDailyOperatingExpenses(poor, 2), 40);
assert.equal(poor.credits, 0);
assert.equal(poor.civilianOperatingExpenses, 50);

const invalid = npc(100);
assert.equal(chargeNpcDailyOperatingExpenses(invalid, -1), 0);
assert.equal(chargeNpcDailyOperatingExpenses(invalid, Number.NaN), 0);
console.log('PASS NPC recurring operating expenses');