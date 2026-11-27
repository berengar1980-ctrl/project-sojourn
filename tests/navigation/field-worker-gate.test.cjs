'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { workerGateAvailable } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-field-arrivals.ts'
);
const { getShipDefinition } = loadStandaloneTypeScriptModule(root, 'src/systems/ships/index.ts');
const shipId = 'miner-80m-variant-01';
assert(getShipDefinition(shipId));
const gate = { x: 180, y: 500 };
const local = { npcId: 'other', shipId, position: gate, headingRadians: 0 };
assert(!workerGateAvailable('entering', shipId, gate, [local], () => []));
assert(workerGateAvailable('entering', shipId, gate, [], () => []));
assert(
  workerGateAvailable(
    'entering',
    shipId,
    gate,
    [{ ...local, position: { x: 600, y: 500 } }],
    () => []
  )
);
assert(
  !workerGateAvailable('entering', shipId, gate, [], () => [
    { id: 'player', position: gate, radius: 50 },
  ])
);
console.log('PASS field worker admission waits for a free existing gate');
