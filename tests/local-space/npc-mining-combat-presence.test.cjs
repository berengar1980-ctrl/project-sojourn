'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createNpcLocalMiningService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-mining-service.ts'
);

const miner = {
  id: 'persistent-miner',
  name: 'Persistent Miner',
  role: 'miner',
  job: 'miner',
  shipId: 'miner-80m-variant-01',
  locationId: 'test-field',
  workLocationId: 'test-field',
  autonomy: { phase: 'working' },
  cargo: {},
  cargoCapacity: 120,
  hullHp: 100,
  hullMaxHp: 100,
  credits: 100000,
  successfulRuns: 0,
  workResourceIds: ['ferrite'],
  workRiskPreference: 'safe',
};
const service = createNpcLocalMiningService({
  locationId: 'test-field',
  seed: 31,
  width: 4200,
  height: 2600,
  miners: [miner],
  getAsteroids: () => [],
  mine: () => 0,
  depart: () => true,
});
assert.equal(service.ships.length, 1);
const ship = service.ships[0];
assert(ship);

for (let battle = 0; battle < 2; battle += 1) {
  miner.combatMovement = { mode: 'engaged' };
  service.tick(0.08);
  assert.strictEqual(service.ships[0], ship, 'combat must not despawn the live miner');
  assert.equal(ship.laserActive, false, 'the miner must suspend its cutting beam');

  miner.combatMovement = null;
  miner.combatRecoverySeconds = 5;
  service.tick(0.08);
  assert.strictEqual(service.ships[0], ship, 'recovery must retain the same ship instance');

  miner.combatRecoverySeconds = 0;
  service.tick(0.08);
  assert.strictEqual(service.ships[0], ship, 'the miner resumes after each fight');
}
console.log('PASS local miner survives two combat and recovery transitions without despawn');
