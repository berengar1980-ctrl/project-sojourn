'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const { createTradeCharterService } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/economy/trade-charter-service.ts'
);

const player = { credits: 100000, cargo: {} };
const charter = createTradeCharterService(player);
assert.equal(charter.active, 'independent');
assert.equal(charter.mayTrade(), true);
assert.equal(charter.join('veylan'), null, 'cannot join while already affiliated');
assert.equal(charter.leave(), true);
assert.equal(charter.mayTrade(), false);
assert.equal(charter.protectsPirate('pirates'), false);
assert.equal(charter.join('veylan'), 85000);
assert.equal(player.credits, 15000);
assert.equal(charter.active, 'veylan');
assert.equal(charter.saleFeeRate(0.25), 0.21);
assert.equal(charter.protectsPirate('pirates'), true);
assert.equal(charter.protectsPirate('pirates2'), false);
assert.equal(charter.leave(), true);
assert.equal(charter.join('mercator'), null, 'unaffordable house cannot grant protection');
assert.equal(player.credits, 15000);
assert.equal(charter.join('independent'), null);
player.credits += 50000;
assert.equal(charter.join('independent'), 35000);
assert.equal(charter.active, 'independent');
console.log('PASS trade charter fees, switching and protection');
