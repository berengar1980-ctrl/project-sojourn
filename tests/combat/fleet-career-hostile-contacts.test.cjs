'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { fleetCareerHostileContacts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/fleet-career-hostile-contacts.ts'
);

const contact = (id, factionId, x, hullHp = 100, targetId = null) => ({
  factionId,
  targetId,
  ship: { id, position: { x, y: 300 }, hullHp },
});
const ships = [
  contact('pirate-a1', 'pirate-a', 100),
  contact('pirate-a2', 'pirate-a', 125),
  contact('pirate-b1', 'pirate-b', 160, 100, 'pirate-a1'),
  contact('pirate-b2', 'pirate-b', 200, 0),
  contact('drone', 'security', 250, 100, 'pirate-b1'),
  contact('miner', 'civilian', 270),
  contact('player', 'player', 280),
  contact('off-field', 'pirate-b', 290),
];
const nativePirates = new Set(['pirate-a1', 'pirate-a2', 'pirate-b1', 'pirate-b2']);
assert.deepEqual(
  fleetCareerHostileContacts('pirate-a1', 'pirate-a', ships, nativePirates, 'drone').map(
    (target) => target.id
  ),
  ['pirate-b1', 'drone'],
  'enemy pirate stays eligible while already fighting; allies, dead and absent are excluded'
);
assert.deepEqual(
  fleetCareerHostileContacts('pirate-b1', 'pirate-b', ships, nativePirates, 'drone').map(
    (target) => target.id
  ),
  ['pirate-a1', 'pirate-a2', 'drone'],
  'both enemy pirates may attack the same ship while another pirate is engaged'
);
assert.deepEqual(
  fleetCareerHostileContacts('pirate-a1', 'pirate-a', ships, nativePirates, null).map(
    (target) => target.id
  ),
  ['pirate-b1'],
  'unavailable security drone must not become a ghost target'
);
const destroyed = ships.map((ship) =>
  ship.ship.id === 'pirate-b1' ? { ...ship, ship: { ...ship.ship, hullHp: 0 } } : ship
);
assert.deepEqual(
  fleetCareerHostileContacts('pirate-a1', 'pirate-a', destroyed, nativePirates, 'drone').map(
    (target) => target.id
  ),
  ['drone'],
  'destroyed target is immediately removed from target options'
);
console.log('PASS shared fleet hostility and already-engaged pirate contact selection');
