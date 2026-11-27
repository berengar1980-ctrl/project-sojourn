'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { resolveCombatBystanderContacts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-bystander-contacts.ts'
);
const fighter = {
  setup: { id: 'player', shipId: 'miner-80m-variant-04' },
  position: { x: 100, y: 100 },
  velocity: { x: 80, y: 0 },
  headingRadians: 0,
  speed: 80,
};
const civilian = {
  id: 'npc-miner',
  shipId: 'miner-80m-variant-01',
  position: { x: 115, y: 100 },
  headingRadians: 0,
};
resolveCombatBystanderContacts(fighter, [civilian]);
assert(fighter.position.x < 100, 'player must not pass through a civilian ship');
assert.equal(fighter.velocity.x, 0, 'contact must cancel closing velocity');
assert.deepEqual(civilian.position, { x: 115, y: 100 }, 'PvP must not mutate civilian poses');
const { getShipDefinition } = loadStandaloneTypeScriptModule(root, 'src/systems/ships/index.ts');
const { shipShieldFootprint, shipShieldGeometry, combatHullRadii } = loadStandaloneTypeScriptModule(
  root,
  'src/core/ship-contact-geometry.ts'
);
const { neutralFleetBlocker } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/native-fleet-advance.ts'
);
const definition = getShipDefinition(civilian.shipId);
assert(definition);
const footprint = shipShieldFootprint(definition, civilian.position, civilian.headingRadians);
assert.deepEqual(neutralFleetBlocker(civilian, new Map()), {
  id: 'ship:' + civilian.id,
  ...footprint,
});
assert.deepEqual(neutralFleetBlocker(civilian, new Map([[civilian.id, 123]])), {
  id: 'ship:' + civilian.id,
  position: civilian.position,
  radius: 123,
});
const hull = combatHullRadii(definition.nominalLengthMeters, shipShieldGeometry(definition));
const second = {
  ...fighter,
  position: { x: civilian.position.x - 1, y: civilian.position.y },
  velocity: { x: 80, y: 0 },
  speed: 80,
};
resolveCombatBystanderContacts(second, [civilian]);
assert(
  Math.abs(
    civilian.position.x - second.position.x - (80 * 0.5 * 0.88 + hull.radiusX + 0.5)
  ) < 1e-8
);

console.log('PASS PvP combat ship cannot pass through noncombat miner');
