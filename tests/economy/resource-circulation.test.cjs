'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const economy = loadStandaloneTypeScriptModule(root, 'src/systems/economy/resource-circulation.ts');

function market(locationId, stock, { produces = [], needs = [] } = {}) {
  return {
    locationId,
    produces: new Set(produces),
    needs: new Set(needs),
    stock: { ...stock },
  };
}

function cargo(entries = {}) {
  return { cargo: { ...entries } };
}

function totalState() {
  return economy.initializeResourcePools(['steel', 'ferrite'], {
    markets: [
      market('haven', { steel: 100, ferrite: 40 }, { needs: ['steel'] }),
      market('forge', { steel: 240, ferrite: 20 }, { produces: ['steel'] }),
    ],
    player: cargo({ steel: 10 }),
    npcs: [cargo({ steel: 15, ferrite: 5 })],
  });
}

{
  const state = totalState();
  assert.equal(state.pools.steel.target, 365);
  assert.equal(state.pools.ferrite.target, 65);
  assert.equal(state.pools.steel.reserve, 0);
  assert.equal(economy.resourceTotal(state, 'steel'), 365);
  assert.equal(economy.resourceTotal(state, 'ferrite'), 65);
}

{
  const state = totalState();
  const before = economy.resourceTotal(state, 'steel');
  const consumed = economy.consumeResourceToReserve(state, 'steel', 30, () => 0);
  assert.equal(consumed, 30);
  assert.equal(state.markets[0].stock.steel, 70);
  assert.equal(state.pools.steel.reserve, 30);
  assert.equal(
    economy.resourceTotal(state, 'steel'),
    before,
    'consumption must move stock to reserve without creating or deleting resources'
  );
}

{
  const state = totalState();
  economy.consumeResourceToReserve(state, 'steel', 24, () => 0);
  const before = economy.resourceTotal(state, 'steel');
  const produced = economy.drawResourceReserve(state, 'steel', 9);
  state.markets[1].stock.steel += produced;

  assert.equal(produced, 9);
  assert.equal(
    economy.resourceTotal(state, 'steel'),
    before,
    'production must move reserve stock into a producer market'
  );
}

{
  const state = totalState();
  const before = economy.resourceTotal(state, 'ferrite');
  const allocated = economy.allocatePhysicalResource(state, 'ferrite', 12, () => 0);

  assert.equal(allocated, 12);
  assert.equal(state.pools.ferrite.allocated, 12);
  assert.equal(
    economy.resourceTotal(state, 'ferrite'),
    before,
    'allocated physical resources must remain part of the circulation total'
  );

  const claimed = economy.claimAllocatedResource(state, 'ferrite', allocated);
  state.player.cargo.ferrite = (state.player.cargo.ferrite ?? 0) + claimed;
  assert.equal(state.pools.ferrite.allocated, 0);
  assert.equal(economy.resourceTotal(state, 'ferrite'), before);
}

{
  const state = totalState();
  const before = economy.resourceTotal(state, 'steel');
  const enemy = cargo({ steel: 18 });
  state.npcs.push(enemy);

  const afterEnemySpawn = economy.resourceTotal(state, 'steel');
  assert.equal(afterEnemySpawn, before + 18);

  const transfer = 7;
  enemy.cargo.steel -= transfer;
  state.player.cargo.steel += transfer;

  assert.equal(
    economy.resourceTotal(state, 'steel'),
    afterEnemySpawn,
    'combat loot from persistent enemy cargo is a transfer and must not draw the pool again'
  );
}

{
  const state = totalState();
  economy.recordResourceLoss(state, 'steel', 40);

  state.markets[0].stock.steel -= 40;
  const afterLoss = economy.resourceTotal(state, 'steel');
  assert.equal(afterLoss, state.pools.steel.target - 40);

  const imported = economy.stabilizeResourcePool(state, 'steel');
  assert(imported > 0);
  assert.equal(state.pools.steel.externalImports, imported);
  assert.equal(economy.resourceTotal(state, 'steel'), afterLoss + imported);
}

{
  const state = totalState();
  const totalBefore = economy.resourceTotal(state, 'steel');
  economy.consumeResourceToReserve(state, 'steel', Number.NaN, () => 0.5);
  economy.drawResourceReserve(state, 'steel', -100);
  economy.recordResourceLoss(state, 'steel', Number.POSITIVE_INFINITY);
  assert.equal(economy.resourceTotal(state, 'steel'), totalBefore);
  assert.equal(state.pools.steel.recordedLosses, 0);
}

{
  const state = totalState();
  const before = economy.resourceTotal(state, 'ferrite');
  const allocated = economy.allocatePhysicalResource(state, 'ferrite', 8, () => 0);
  const released = economy.releaseAllocatedResource(state, 'ferrite', allocated);
  assert.equal(released, 8);
  assert.equal(state.pools.ferrite.allocated, 0);
  assert.equal(economy.resourceTotal(state, 'ferrite'), before);
}

console.log('PASS economy resource-circulation invariants');
