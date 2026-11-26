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
assert.equal(service.payNpcPatrolContract(npc), 2800);
assert.equal(npc.credits, 2800);
npc.pirate = true;
assert.equal(service.payNpcPatrolContract(npc), 0, 'pirates have no patrol subsidy');

{
  const frugal = {
    job: 'miner',
    fuel: 20,
    fuelCapacity: 20,
    hullHp: 90,
    hullMaxHp: 100,
    credits: 500,
  };
  service.serviceNpcAtPort(frugal, port);
  assert.equal(frugal.hullHp, 90, 'minor damage is deferred when repairs exhaust cash reserve');
  assert.equal(frugal.credits, 500, 'deferred maintenance must not debit credits');
  frugal.credits = 5000;
  service.serviceNpcAtPort(frugal, shipyard);
  assert.equal(frugal.hullHp, 100, 'well-funded NPC repairs minor damage');

  const critical = {
    job: 'salvager',
    fuel: 0,
    fuelCapacity: 10,
    hullHp: 20,
    hullMaxHp: 100,
    credits: 300,
  };
  service.serviceNpcAtPort(critical, port);
  assert.equal(critical.hullHp, 23, 'critical damage is repaired before optional refueling');
  assert.equal(critical.fuel, 0, 'money spent on repairs cannot buy imaginary fuel');
  assert.equal(critical.credits, 0);
}

console.log('PASS NPC refuel, repairs, port availability and contracted patrol funding');
