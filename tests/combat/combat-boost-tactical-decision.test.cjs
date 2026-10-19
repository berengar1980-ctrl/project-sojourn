'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { usefulCombatBoost } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-boost-decision.ts'
);
const gun = (range, damage) => ({
  weapon: {
    mount: 'forward',
    arcDegrees: 60,
    rangeMeters: range,
    shieldDamage: damage,
    hullDamage: damage,
  },
});
function ship(x, facing, weapons, cooldowns = []) {
  return {
    position: { x, y: 500 },
    velocity: { x: 0, y: 0 },
    headingRadians: facing,
    shieldHp: 100,
    tactic: 'fight',
    setup: { weapons },
    cooldowns,
    subsystems: { engine: 100 },
  };
}
const own = ship(200, 0, [gun(600, 55)], [0]);
const enemy = ship(1100, Math.PI, [gun(600, 40)], [0]);
const useful = (range = 900, deliberateRam = false) =>
  usefulCombatBoost(own, enemy, range, 500, deliberateRam, 1);

assert.equal(useful(), false, 'two ships approaching from beyond gun range conserve boost');
enemy.setup.weapons = [gun(1100, 40)];
assert.equal(useful(), true, 'enemy firing while own ship is outranged justifies boost');
enemy.cooldowns = [3];
assert.equal(useful(), false, 'enemy gun on long cooldown does not create immediate pressure');
enemy.setup.weapons = [];
own.cooldowns = [3];
assert.equal(useful(), true, 'cooling primary railgun permits productive repositioning');
assert.equal(useful(500), false, 'no boost while already holding a useful firing distance');
own.setup.weapons.push(gun(1100, 5));
own.cooldowns.push(0);
enemy.setup.weapons = [gun(1100, 40)];
enemy.cooldowns = [0];
assert.equal(useful(), true, 'cooling railgun may reposition despite a ready backup gun');
own.setup.weapons.pop();
own.cooldowns.pop();
enemy.setup.weapons = [];
own.cooldowns = [0];
assert.equal(useful(), false, 'loaded gun and no incoming fire conserve boost');
own.ramApproach = { side: 1, phase: 'flank' };
assert.equal(useful(350, true), false, 'ram flank staging must not waste boost');
own.ramApproach.phase = 'impact';
assert.equal(useful(350, true), true, 'ram final charge receives priority');
own.tactic = 'flee';
assert.equal(useful(), true, 'explicit retreat always permits boost');
console.log('PASS boost only for retreat, ram impact, hostile range gap or useful reload window');
