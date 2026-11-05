'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const service = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-port-servicing.ts');
const port = {
  kind: 'planet',
  activities: { dock: true, trade: true },
};
const shipyard = {
  kind: 'station',
  activities: { dock: true, refuel: true, shipyard: true },
};
const field = { kind: 'asteroid-field', activities: { mine: true } };
assert.equal(service.isServicedPort(port), true);
assert.equal(service.isServicedPort(shipyard), true);
assert.equal(service.isServicedPort(field), false);
const npc = {
  id: 'fixture',
  job: 'freighter',
  pirate: false,
  fuel: 5,
  fuelCapacity: 10,
  hullHp: 20,
  hullMaxHp: 30,
  credits: 100,
};
service.serviceNpcAtPort(npc, field);
assert.equal(npc.fuel, 5);
assert.equal(npc.credits, 100);
service.serviceNpcAtPort(npc, port);
assert.equal(npc.fuel, 10, 'NPC must pay 10 CR per unit even without shipyard');
assert.equal(npc.credits, 50);
assert.equal(npc.hullHp, 20, 'cannot receive free repairs when broke');
npc.credits = 800;
service.serviceNpcAtPort(npc, shipyard);
assert.equal(npc.hullHp, 30, 'shipyard repairs full damage at reduced price');
assert.equal(npc.credits, 0);
npc.fuel = 0;
service.serviceNpcAtPort(npc, port);
assert.equal(npc.fuel, 0, 'broke NPC cannot refuel free');
assert.equal(service.payNpcPatrolContract(npc), 0);
npc.job = 'patrol';
assert.equal(service.payNpcPatrolContract(npc), 500);
assert.equal(npc.credits, 500);
npc.pirate = true;
assert.equal(service.payNpcPatrolContract(npc), 0, 'pirates have no patrol subsidy');

console.log('PASS NPC refuel, repairs, port availability and contracted patrol funding');
