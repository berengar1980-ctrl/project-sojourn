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
const outbound = {
  id: 'leaving',
  position: { x: gate.x + 140, y: gate.y },
  radius: 40,
  intent: { priority: 2, movable: true, waitingSeconds: 0, direction: { x: -1, y: 0 } },
};
assert(!workerGateAvailable('entering', shipId, gate, [], () => [outbound]));
assert(
  workerGateAvailable('entering', shipId, gate, [], () => [
    { ...outbound, intent: { ...outbound.intent, direction: { x: 1, y: 0 } } },
  ])
);
assert(
  workerGateAvailable('entering', shipId, gate, [], () => [
    { ...outbound, position: { x: gate.x + 500, y: gate.y } },
  ])
);
console.log('PASS field worker admission waits for a free existing gate');
