'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const registry = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const movement = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-stats.ts');
const components = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const damage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const ships = registry.getAllShipDefinitions();
const ship = (role) => ships.find((entry) => entry.role === role);

for (const role of ['freighter', 'mining', 'salvage', 'patrol']) {
  assert(ship(role), role + ' hull must be registered');
}

assert.equal(ship('freighter').navigation.cruiseSpeed, 195);
assert.equal(movement.resolveShipCombatMovementStats(ship('freighter')).combatSpeed, 69);
assert.equal(movement.resolveShipGameplayStats(ship('freighter')).combatBaseSpeed, 69);
assert.equal(movement.resolveShipLocalCruiseSpeed(ship('freighter')), 69);
assert.equal(movement.resolveShipCombatMovementStats(ship('mining')).combatSpeed, 78);
assert.equal(movement.resolveShipCombatMovementStats(ship('patrol')).combatSpeed, 101);

for (let tier = 1; tier <= 6; tier++) {
  const installed = { engine: ['engine' + tier] };
  const bonus = components.getShipComponent('engine', 'engine' + tier).speed;
  const baseline = movement.resolveShipCombatMovementStats(ship('freighter'));
  const upgraded = movement.resolveShipCombatMovementStats(ship('freighter'), installed);
  assert.equal(upgraded.combatSpeed, Math.round(69 * (1 + bonus)));
  assert.equal(
    movement.resolveShipLocalCruiseSpeed(ship('freighter'), installed),
    upgraded.combatSpeed
  );
  assert(upgraded.accelerationMetersPerSecond2 >= baseline.accelerationMetersPerSecond2);
  assert.equal(components.engineSpeedMultiplier(installed), 1 + bonus);
  const turnRatio = upgraded.turnRateRadiansPerSecond / baseline.turnRateRadiansPerSecond;
  assert(Math.abs(turnRatio - (1 + bonus)) < 1e-10);
}

for (let tier = 1; tier <= 6; tier++) {
  const strength = [15, 22, 29, 36, 43, 50][tier - 1] / 100;
  const rear = components.getShipComponent('armor', 'armor-rear-' + tier).armor;
  const front = components.getShipComponent('armor', 'armor-front-' + tier).armor;
  const sides = components.getShipComponent('armor', 'armor-sides-' + tier).armor;
  const all = components.getShipComponent('armor', 'armor-all-' + tier).armor;
  assert.equal(rear.rear, strength);
  assert.equal(front.front, strength);
  assert.equal(sides.port, strength / 2);
  assert.equal(sides.starboard, strength / 2);
  for (const facing of ['front', 'rear', 'port', 'starboard']) {
    assert.equal(all[facing], strength / 4);
  }
}

const protection = components.resolveShipArmorProtection({ armor: ['armor-front-6'] });
const target = {
  setup: { armor: protection },
  position: { x: 0, y: 0 },
  headingRadians: 0,
  hullHp: 100,
  shieldHp: 0,
  subsystems: { engine: 100, tractor: 100 },
};
assert.equal(damage.directionalHullDamage(target, 40, { x: 10, y: 0 }), 20);
assert.equal(damage.directionalHullDamage(target, 40, { x: -10, y: 0 }), 40);
assert.equal(damage.directionalHullDamage(target, 40, { x: 0, y: 10 }), 40);
target.headingRadians = Math.PI;
assert.equal(damage.directionalHullDamage(target, 40, { x: -10, y: 0 }), 20);
target.headingRadians = 0;
const attacker = { setup: { damageMultiplier: 1 } };
const hit = damage.applyDamage(target, 0, 40, attacker, false, { x: 100, y: 0 }, 'laser', 1);
assert.equal(hit.damage, 20);
assert.equal(target.hullHp, 80);
assert.equal(components.resolveShipArmorProtection({ armor: [''] }), undefined);
console.log(
  'PASS engine speeds, freighter baseline and six tiers of four directional armor patterns'
);
