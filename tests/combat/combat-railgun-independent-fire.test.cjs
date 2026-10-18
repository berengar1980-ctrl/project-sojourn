'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { advanceRuntimeWeapons } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-weapons.ts'
);
const rail = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon-railgun-1');
const turret = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon1');
assert(rail && turret);
const arena = {
  width: 2800,
  height: 1500,
  attackerPosition: { x: 650, y: 750 },
  defenderPosition: { x: 1050, y: 750 },
  obstacles: [],
};
function setup(id, weapons, mounts) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 0,
    hullHp: 350,
    weapons,
    weaponMounts: mounts,
    hitChance: 0.98,
    dodgeChance: 0,
    criticalChance: 0,
    damageMultiplier: 1,
    cycleTimeMultiplier: 1,
  };
}
const forwardMounts = [
  { slotIndex: 0, x: 20, y: -8, facing: 'forward', arcDegrees: 60 },
  { slotIndex: 1, x: 20, y: 8, facing: 'forward', arcDegrees: 60 },
  { slotIndex: 2, x: 0, y: 0, facing: 'forward', arcDegrees: 360 },
];
const source = createCombatant(
  setup('hunter', [rail, rail, turret], forwardMounts),
  'attacker',
  arena
);
const target = createCombatant(setup('runner', [], []), 'defender', arena);
source.cooldowns.fill(0);
source.tactic = 'fight';
target.tactic = 'flee';
target.velocity = { x: 70, y: 0 };
target.shieldHp = 0;
const runtime = {
  attacker: source,
  defender: target,
  arena,
  elapsedSeconds: 2,
  random: () => 0.1,
  projectiles: [],
  beams: [],
  beamSerial: 0,
  impactSerial: 0,
  lastImpact: null,
  recentImpacts: [],
};
advanceRuntimeWeapons(runtime, 'attacker', source, target, 0.08);
const rails = runtime.beams.filter((beam) => beam.family === 'railgun');
assert.equal(rails.length, 2, 'both loaded railguns fire on an unshielded fleeing target');
assert.equal(runtime.recentImpacts.filter((hit) => hit.weaponFamily === 'railgun').length, 2);
assert(source.cooldowns[0] > 7 && source.cooldowns[1] > 7, 'each railgun reloads independently');
console.log('PASS loaded railguns fire independently without tactical reservation');
