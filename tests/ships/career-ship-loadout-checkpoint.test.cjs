'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { getAllShipDefinitions, getShipDefinition } = load('src/systems/ships/ship-registry.ts');
const { createShipLoadoutService, stageCareerShipLoadouts } = load(
  'src/systems/ships/ship-loadout-service.ts'
);
const ship = getAllShipDefinitions()[0];
assert(ship);
const live = createShipLoadoutService();
live.get(ship);
const checkpoint = live.snapshot();
const staged = stageCareerShipLoadouts(checkpoint, [ship.id], getShipDefinition);
assert.deepEqual(staged.snapshot()[ship.id], checkpoint[ship.id]);
assert.notStrictEqual(staged.get(ship), live.get(ship));
assert.throws(() =>
  stageCareerShipLoadouts({ unknown: checkpoint[ship.id] }, [ship.id], getShipDefinition)
);
assert.throws(() =>
  stageCareerShipLoadouts({ [ship.id]: { nonsense: ['fake'] } }, [ship.id], getShipDefinition)
);
assert.throws(() =>
  stageCareerShipLoadouts({ [ship.id]: { weapon: ['invalid-component'] } }, [ship.id], getShipDefinition)
);
assert.deepEqual(live.snapshot(), checkpoint, 'invalid restore must not mutate live loadouts');
console.log('PASS career ship loadout checkpoint: restore and invalid slot rejection');
