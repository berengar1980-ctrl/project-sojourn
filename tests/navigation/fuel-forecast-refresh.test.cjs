'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { canReuseFuelForecast } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-fuel-forecast.ts'
);

const entry = { key: 'sector|haven|cinder|mk3', threatRevision: 4, computedAtMs: 1000, plan: null };

assert.equal(canReuseFuelForecast(undefined, entry.key, 4, 1200, false), false);
assert.equal(canReuseFuelForecast(entry, 'another-target', 4, 1200, false), false);
assert.equal(canReuseFuelForecast(entry, entry.key, 4, 9000, false), true);
assert.equal(canReuseFuelForecast(entry, entry.key, 5, 4999, false), true);
assert.equal(canReuseFuelForecast(entry, entry.key, 5, 5000, false), false);
assert.equal(canReuseFuelForecast(entry, entry.key, 5, 1200, true), false);
assert.equal(canReuseFuelForecast(entry, entry.key, 4, 1200, true), true);

console.log('PASS fuel preview throttle never reuses stale threats for departure');
