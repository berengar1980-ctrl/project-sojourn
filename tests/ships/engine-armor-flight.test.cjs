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
const autopilot = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-autopilot.ts'
);
const navigation = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/navigation-service.ts'
);
for (const role of ['freighter', 'mining', 'salvage', 'patrol']) {
  const hull = ship(role);
  const normal = movement.resolveShipCombatMovementStats(hull, { engine: ['engine1'] });
  const upgrade = movement.resolveShipCombatMovementStats(hull, { engine: ['engine6'] });
  const turnMultiplier = upgrade.turnRateRadiansPerSecond / normal.turnRateRadiansPerSecond;
  assert(Math.abs(turnMultiplier - 1.78) < 1e-10);
}
function localShip() {
  return {
    position: { x: 0, y: 0 },
    headingRadians: 0,
    speed: 0,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
  };
}
const route = [{ x: 0, y: 0 }, { x: 0, y: 300 }];
const normalLocal = localShip();
const fastLocal = localShip();
autopilot.advanceAutopilotRoute(normalLocal, route, 1, 78, 0.1, false, false, 1);
autopilot.advanceAutopilotRoute(fastLocal, route, 1, 78, 0.1, false, false, 1.78);
const localMultiplier = fastLocal.headingRadians / normalLocal.headingRadians;
assert(Math.abs(localMultiplier - 1.78) < 1e-10);
const sector = {
  locations: [{ id: 'start', position: { x: 0, y: 0 } }],
  width: 2000,
  height: 1200,
};
const normalNav = navigation.createNavigationService(sector, 'start', 220);
const fastNav = navigation.createNavigationService(sector, 'start', 220);
normalNav.startPursuit('target', { x: 0, y: 500 });
fastNav.setTurnRateMultiplier(1.78);
fastNav.startPursuit('target', { x: 0, y: 500 });
const normalTurn = normalNav.tick(0.1).turnRateRadiansPerSecond;
const fastTurn = fastNav.tick(0.1).turnRateRadiansPerSecond;
assert(Math.abs(fastTurn / normalTurn - 1.78) < 1e-10);
console.log('PASS engine speeds, directional armor and drive-adjusted RCS across flight modes');
