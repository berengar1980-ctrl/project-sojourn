'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const ship = (id, shieldHp = 100, hullHp = 200) => ({
  id,
  name: id,
  shipId: 'patrol',
  shieldHp,
  hullHp,
  weapons: [],
  mines: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  aiControlled: true,
  preferredTactic: 'fight',
  combatSpeed: 120,
  accelerationMetersPerSecond2: 25,
  turnRateRadiansPerSecond: 1,
});
const arena = (distance) => ({
  width: 3200,
  height: 1800,
  attackerPosition: { x: 700, y: 900 },
  defenderPosition: { x: 700 + distance, y: 900 },
  obstacles: [],
});
const normal = createStrategicCombatService(ship('alpha'), ship('beta'), 202, arena(1450));
let boostSeen = false;
for (let i = 0; i < 60; i += 1) {
  const model = normal.tick(0.1);
  boostSeen ||= model.attacker.boostActive || model.defender.boostActive;
}
assert(boostSeen, 'regular campaign fights use boost even without exchange seed 1001');
const ramming = createStrategicCombatService(
  ship('rammer', 100, 200),
  ship('vulnerable', 0, 35),
  202,
  arena(490)
);
let ramIntent = false;
for (let i = 0; i < 40; i += 1) {
  const model = ramming.tick(0.1);
  ramIntent ||= model.attacker.combatIntent === 'RAMMEN';
}
assert(ramIntent, 'standard AI deliberately selects a ramming course against a vulnerable ship');
console.log('PASS normal-mode boost and deliberate ram intent on non-exchange seed');
