'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const actualMinerShip = getAllShipDefinitions().find((ship) => ship.role === 'mining');
assert(actualMinerShip, 'test must use an actual mining hull');

const location = {
  id: 'background-test-field',
  activities: { mine: true },
  minedResourceIds: ['ferrite'],
};
const claims = new AsteroidClaimRegistry();
const miner = {
  id: 'field-miner-1',
  name: 'Miner eins',
  role: 'miner',
  job: 'miner',
  shipId: actualMinerShip.id,
  locationId: location.id,
  workLocationId: location.id,
  autonomy: { phase: 'working' },
  cargo: {},
  cargoCapacity: 150,
  hullHp: 100,
  hullMaxHp: 100,
  workResourceIds: ['ferrite'],
  workRiskPreference: 'safe',
};
let extracted = 0;
const world = new AsteroidFieldWorld([location], claims, (at, instance) =>
  createNpcLocalMiningService({
    locationId: at.id,
    seed: instance.seed,
    width: instance.width,
    height: instance.height,
    miners: [miner],
    getAsteroids: () => instance.asteroids,
    mine: (npc, resource, amount) => {
      extracted += amount;
      npc.cargo[resource] = (npc.cargo[resource] ?? 0) + amount;
      return amount;
    },
    depart: () => true,
  })
);
const field = world.field(location.id);
assert(field);
assert.equal(world.field('unknown'), null);
assert.strictEqual(world.field(location.id), field, 'Returning to the field retains its owner');
const rock = field.instance.asteroids.find((a) => a.kind === 'resource' && a.deposits.length);
assert(rock, 'Generated field must contain mineable rocks');
const initialOre = field.instance.asteroids
  .flatMap((a) => a.deposits)
  .reduce((total, d) => total + d.oreRemaining, 0);
let backgroundSteps = 0;
for (let frame = 0; frame < 720; frame++) {
  world.tick(0.25, null, (entry, dt) => {
    assert.strictEqual(entry, field);
    backgroundSteps++;
    entry.miners.tick(dt);
  });
}
assert.equal(backgroundSteps, 720 * 4, 'Distant fields use four bounded steps per quarter second');
assert(extracted > 0, 'Miner must mine ore even when no player scene is mounted');
const afterOre = field.instance.asteroids
  .flatMap((a) => a.deposits)
  .reduce((total, d) => total + d.oreRemaining, 0);
assert(afterOre < initialOre, 'Distant mining and its mining events must deplete real deposits');

const before = backgroundSteps;
world.tick(0.08, location.id, (entry, dt) => {
  backgroundSteps++;
  entry.miners.tick(dt);
});
assert.equal(backgroundSteps, before + 1, 'Active field runs only once per frame');
assert.strictEqual(world.field(location.id).instance.asteroids, field.instance.asteroids);
assert.equal(
  claims.seedFor(location.id, () => 999),
  field.instance.seed
);
console.log('PASS persistent asteroid world: distant mining, ore conservation, active handoff');
