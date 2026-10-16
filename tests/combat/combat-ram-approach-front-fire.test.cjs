'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const rail = SHIP_COMPONENT_CATALOG.weapon.find((item) => item.id === 'weapon-railgun-1');
const side = SHIP_COMPONENT_CATALOG.weapon.find((item) => item.id === 'weapon-autocannon-1');
assert(rail && side);
function setup(id, hull, shield) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: shield,
    hullHp: hull,
    weapons: [rail, side],
    weaponMounts: [
      { slotIndex: 0, x: 0, y: 0, facing: 'forward' },
      { slotIndex: 1, x: 0, y: 0, facing: 'port' },
    ],
    hitChance: 0.95,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 110,
    turnRateRadiansPerSecond: 1,
    accelerationMetersPerSecond2: 35,
    aiControlled: true,
    aiAggression: 100,
  };
}
const arena = {
  width: 2600,
  height: 1600,
  attackerPosition: { x: 850, y: 800 },
  defenderPosition: { x: 1300, y: 800 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
};
const combat = createStrategicCombatService(setup('rammer', 260, 200), setup('weak', 70, 0), 100, arena);
let seenRam = false;
let seenForwardShot = false;
for (let tick = 0; tick < 20; tick += 1) {
  const frame = combat.tick(0.08);
  seenRam ||= frame.attacker.combatIntent === 'RAMMEN';
  const attackerRails = frame.beams.filter((beam) => beam.owner === 'attacker' && beam.kind === 'rail');
  seenForwardShot ||= attackerRails.length > 0;
}
assert(seenRam, 'tactically justified ram retains frontal approach');
assert(seenForwardShot, 'forward gun may still fire during a real ram approach');
console.log('PASS physical ram approach still uses forward gun when in range and arc');
