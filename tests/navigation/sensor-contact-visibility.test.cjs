'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const sensors = loadStandaloneTypeScriptModule(
  root,
  'src/systems/scanning/sensor-contact-service.ts'
);

const origin = { x: 0, y: 0 };

const weakCivilian = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 3200, y: 0 },
  sensorSkill: 20,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(weakCivilian.visible, false, 'weak sensors must lose distant civilian transponders');

const eliteCivilian = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 3200, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(eliteCivilian.visible, true, 'elite sensors must resolve distant civilian transponders');
assert.equal(eliteCivilian.identified, true);
assert.equal(eliteCivilian.source, 'transponder');

const pirateContact = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 400, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: false,
  pirate: true,
});
assert.equal(pirateContact.visible, true, 'elite sensors must detect a nearby low-signature pirate');
assert.equal(
  pirateContact.identified,
  false,
  'pirate detection range must remain larger than pirate identification range'
);

const pirateIdentified = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 200, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: false,
  pirate: true,
});
assert.equal(pirateIdentified.identified, true, 'close pirate contacts must become identified');

console.log('PASS Voidbound sensor/transponder visibility and pirate identification ranges');
