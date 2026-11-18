'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { LocalPirateTraffic } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-service.ts'
);

const traffic = new LocalPirateTraffic(4000, 2600, 1234);
const pirate = {
  id: 'pirate-duel',
  name: 'Duellpirat',
  shipId: 'ship-raider',
  pirate: true,
  travel: null,
  combatMovement: null,
  hullHp: 100,
  combatRecoverySeconds: 0,
};
const backgroundPirate = { ...pirate, id: 'pirate-background' };
traffic.reconcile([pirate, backgroundPirate]);
assert.equal(traffic.snapshot([pirate, backgroundPirate]).length, 2);

pirate.combatMovement = { targetId: 'player' };
backgroundPirate.combatMovement = { targetId: 'miner' };
traffic.reconcile([pirate, backgroundPirate], pirate.id);
const ships = traffic.snapshot([pirate, backgroundPirate]);
assert.equal(ships.length, 1, 'only the active duel defender stays in the local field');
assert.equal(ships[0].npcId, pirate.id, 'active duel defender must remain renderable');

traffic.syncCombatPose(pirate.id, { x: 750, y: 610 }, 0.7);
traffic.tick(1 / 60, [pirate], { x: 500, y: 500 }, [], [], () => false, pirate.id);
const combatShip = traffic.snapshot([pirate])[0];
assert.deepEqual(combatShip.position, { x: 750, y: 610 }, 'normal pirate AI must not move duel defender');
assert.equal(combatShip.headingRadians, 0.7);

pirate.combatMovement = null;
traffic.reconcile([pirate]);
assert.equal(traffic.snapshot([pirate]).length, 1, 'duel ship persists after combat ends');
console.log('PASS local pirate remains visible during strategic combat and is not double-moved');
