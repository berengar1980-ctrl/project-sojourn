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
const { LocalPirateTraffic } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-service.ts'
);
const traffic = new LocalPirateTraffic(2000, 1400, 19);
const npc = {
  id: 'patrol',
  name: 'patrol',
  job: 'patrol',
  shipId: 'patrol-60m-variant-01',
  hullHp: 100,
  locationId: 'field',
};
traffic.reconcile([npc]);
const spawn = traffic.body(npc.id).position;
const waiting = new LocalPirateTraffic(2000, 1400, 19);
waiting.reconcile([npc], undefined, () => [{ id: 'worker', position: spawn, radius: 50 }]);
assert.equal(waiting.body(npc.id), undefined, 'armed traffic must wait outside an occupied entry');
waiting.reconcile([npc], undefined, () => []);
assert.deepEqual(waiting.body(npc.id).position, spawn);
console.log('PASS field worker admission waits for a free existing gate');
