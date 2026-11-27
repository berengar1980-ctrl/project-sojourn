'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const sensors = loadStandaloneTypeScriptModule(
  root,
  'src/systems/scanning/sensor-contact-service.ts'
);
const scanner = loadStandaloneTypeScriptModule(root, 'src/systems/scanning/scanner-service.ts');

const origin = { x: 0, y: 0 };

const weakCivilian = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 3200, y: 0 },
  sensorSkill: 20,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(weakCivilian.visible, false, 'weak sensors must lose distant civilian transponders');

const standardCivilian = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 800, y: 0 },
  sensorSkill: 35,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(standardCivilian.visible, true, 'nearby civilian traffic must remain visible');
assert.equal(standardCivilian.identified, true);
assert.equal(standardCivilian.source, 'transponder');

const beyondLocalTraffic = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 1800, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(
  beyondLocalTraffic.visible,
  false,
  'even elite transponder reception must not expose distant sector traffic'
);

const eliteCivilian = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 1100, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(eliteCivilian.visible, true, 'elite crews detect farther local civilian signals');
assert.equal(eliteCivilian.identified, true);
assert.equal(eliteCivilian.source, 'transponder');
assert.equal(eliteCivilian.range, 1150);

const zoomedOutCivilian = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 3200, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: true,
});
assert.equal(
  zoomedOutCivilian.visible,
  false,
  'a distant ship must remain hidden even when the star map is fully zoomed out'
);

const pirateContact = sensors.sectorSensorContactInfo({
  playerPosition: origin,
  targetPosition: { x: 400, y: 0 },
  sensorSkill: 100,
  sensorModifier: 1,
  civilianTransponder: false,
  pirate: true,
});
assert.equal(
  pirateContact.visible,
  true,
  'elite sensors must detect a nearby low-signature pirate'
);
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

assert.equal(
  scanner.longRangeScanRadius({ sensorModifier: 1, crewSkill: 20 }),
  1080,
  'automation-grade sensors must preserve the prior Sojourn scan baseline'
);
assert(
  scanner.longRangeScanRadius({ sensorModifier: 1, crewSkill: 100 }) > 2700,
  'elite sensor crews must materially extend long-range asteroid scans'
);

console.log('PASS local civilian transponder range, pirate contacts and independent mining scan');

const { combatSensorStats, sensorRangeMultiplier } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const installed = { sensor: ['sensor1'] };
const tactical = combatSensorStats(installed, 50);
assert.equal(tactical.sensorTier, 1);
assert.equal(tactical.sensorRangeMeters, 1000);
assert.equal(tactical.sensorRangeMultiplier, sensorRangeMultiplier(installed));
assert.equal(combatSensorStats(installed, 50, false).sensorRangeMeters, 0);
assert.equal(combatSensorStats({}, 50).sensorTier, 0);
