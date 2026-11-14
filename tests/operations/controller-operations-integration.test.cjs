'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createControllerEconomy } = load('src/app/game-controller-economy.ts');
const { narrowsSector: world } = load('src/data/maps/narrows-sector.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { tickControllerNpcOperations } = load('src/app/game-controller-npc-tick.ts');
const tickCalls = [];
const stub = Object.fromEntries(
  ['sectorNpcs', 'blockades', 'npcSmuggling', 'npcSalvageEvents', 'npcs'].map((name) => [
    name,
    { tick: (dt) => tickCalls.push([name, dt]) },
  ])
);
tickControllerNpcOperations(stub, 0.25);
assert.deepEqual(tickCalls, [
  ['sectorNpcs', 0.25],
  ['blockades', undefined],
  ['npcSmuggling', 0.25],
  ['npcSalvageEvents', undefined],
  ['npcs', 0.25],
]);
const economy = createControllerEconomy({
  getSnapshot: () => ({ currentPosition: world.star.position }),
});
const e = economy;
const miner = e.sectorNpcs.npcs.find((n) => n.job === 'miner');
const site = world.locations.find((l) => l.id === miner.workLocationId);
// The runtime now keeps asteroid ownership independent of market-level extraction.
miner.locationId = site.id;
delete miner.travel;
delete miner.combatMovement;
e.trade.player.credits = 200000;
const resourceId = site.minedResourceIds[0];
const before = e.trade.player.credits;
assert.equal(e.npcs.mineLocal(miner, resourceId, 3), 3);
assert.equal(e.trade.player.credits, before, 'no fictitious area-wide royalties');
assert.equal(e.mining.collect(resourceId, 4, 10000, site.id), 4);
assert.equal(e.asteroidClaims.snapshot().claims.length, 0);
const charter = e.charters.snapshot();
charter.active = null;
assert.equal(e.charters.active, 'independent');
assert(e.charters.leave());
const credits = e.trade.player.credits;
assert.equal(e.charters.join('veylan'), 85000);
assert.equal(e.trade.player.credits, credits - 85000);
assert.equal(e.charters.join('mercator'), null);
// Real NPC movement, careers and market circulation run alongside new domain state.
const days = Number(process.env.SOJOURN_OPERATIONS_DAYS ?? 30);
assert(Number.isInteger(days) && days >= 1 && days <= 365);
for (let day = 1; day <= days; day++) {
  for (let frame = 0; frame < 720; frame++) {
    e.sectorNpcs.tick(0.25);
    e.blockades.tick();
    e.npcs.tick(0.25);
  }
  e.situations.advanceNextDay();
  e.blockades.advanceDay(day);
  e.patrol.advanceDay(day);
  e.simulation.advanceNextDay();
  e.npcs.advanceNextDay();
  e.sectorNpcs.advanceDay(day);
  for (const n of e.sectorNpcs.npcs) {
    assert(Number.isFinite(n.credits) && n.credits >= 0, n.id + ' credits');
    assert(Object.values(n.cargo).every((q) => Number.isFinite(q) && q >= 0));
  }
  for (const r of economyResources) {
    const pool = e.simulation.pools[r.id];
    assert.equal(
      e.simulation.getResourceTotal(r.id) + pool.recordedLosses,
      pool.target + pool.externalImports,
      'conservation ' + r.id
    );
  }
}
assert.doesNotThrow(() =>
  JSON.stringify([e.blockades.snapshot(), e.asteroidClaims.snapshot(), e.patrol.snapshot()])
);
console.log(
  'PASS composed controller: extraction without area royalties, trade mandates, ' +
    days +
    '-day state and resource invariants'
);
