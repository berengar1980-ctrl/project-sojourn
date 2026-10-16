'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const { fitsWeaponHardpoint } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-loadout-service.ts'
);
const { combatEquippedWeapons, combatWeaponMounts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-loadout-mounts.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { scoreWeaponPosture } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-posture-score.ts'
);
const { advanceRuntimeWeapons } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-weapons.ts'
);

const weapon = (id) => {
  const found = SHIP_COMPONENT_CATALOG.weapon.find((component) => component.id === id);
  assert(found, id);
  return found;
};
const repeater = weapon('weapon-front-repeater-1');
const rail = weapon('weapon-railgun-1');
const ion = weapon('weapon-ion-laser-1');
const missile = weapon('weapon-he-missile-1');
const plasma = weapon('weapon-plasma-battery-1');
const autocannon = weapon('weapon-autocannon-1');

assert.equal(repeater.weapon.mount, 'forward');
assert.equal(repeater.weapon.arcDegrees, 60);
assert.equal(repeater.weapon.cooldownSeconds, 0.2);
assert.equal(repeater.weapon.rangeMeters, 600);

for (const name of ['patrol-60m', 'miner-80m', 'freighter-120m', 'salvage-100m']) {
  for (let variant = 1; variant <= 7; variant += 1) {
    const id = `${name}-variant-0${variant}`;
    const points = JSON.parse(
      fs.readFileSync(path.join(root, 'src/data/ships', id + '.hardpoints.json'), 'utf8')
    );
    const mounts = points.weaponMounts;
    assert.deepEqual(
      mounts.map((mount) => mount.slotIndex),
      [0, 1, 2, 3, 4, 5],
      id + ': preserve existing slot indices and add a second bow mount'
    );
    assert.deepEqual(
      [mounts[0].facing, mounts[1].facing, mounts[2].facing, mounts[5].facing],
      ['forward', 'port', 'starboard', 'forward']
    );
    const ship = { id, nominalLengthMeters: 80, sprite: { hardpoints: points } };
    for (const slot of [0, 5]) {
      assert(fitsWeaponHardpoint(ship, slot, repeater.weapon), id + ': front repeater');
      assert(fitsWeaponHardpoint(ship, slot, rail.weapon), id + ': front railgun');
      assert(!fitsWeaponHardpoint(ship, slot, missile.weapon), id + ': no front missiles');
    }
    for (const slot of [3, 4]) {
      assert.equal(mounts[slot].arcDegrees, 360);
      assert(fitsWeaponHardpoint(ship, slot, ion.weapon), id + ': universal turret');
      assert(fitsWeaponHardpoint(ship, slot, missile.weapon), id + ': universal missile');
      assert(!fitsWeaponHardpoint(ship, slot, rail.weapon), id + ': no turret railgun');
    }
    const fitted = combatEquippedWeapons(ship, [
      repeater.id,
      plasma.id,
      autocannon.id,
      ion.id,
      missile.id,
      rail.id,
    ]);
    assert.equal(fitted.length, 6, id + ': all independent mounts resolve');
    const world = combatWeaponMounts(ship, fitted);
    assert.equal(world.length, 6);
    assert.notDeepEqual(world[0], world[5], id + ': bow muzzles are physically separate');
  }
}

const arena = {
  width: 2200,
  height: 1200,
  attackerPosition: { x: 600, y: 600 },
  defenderPosition: { x: 970, y: 600 },
};
const setup = (id, weapons, weaponMounts) => ({
  id,
  name: id,
  shipId: 'patrol-60m-variant-01',
  shieldHp: 200,
  hullHp: 300,
  weapons,
  weaponMounts,
  hitChance: 0.98,
  dodgeChance: 0,
  criticalChance: 0,
  damageMultiplier: 1,
  cycleTimeMultiplier: 1,
  combatSpeed: 110,
  turnRateRadiansPerSecond: 1.1,
});
const fronts = [
  { slotIndex: 0, x: 16, y: -8, facing: 'forward', arcDegrees: 60 },
  { slotIndex: 1, x: 16, y: 8, facing: 'forward', arcDegrees: 60 },
];
const attacker = createCombatant(setup('attacker', [repeater, repeater], fronts), 'attacker', arena);
const defender = createCombatant(setup('defender', [], []), 'defender', arena);
attacker.cooldowns[0] = 0;
attacker.cooldowns[1] = 0;
const runtime = {
  attacker,
  defender,
  elapsedSeconds: 1,
  random: () => 0.1,
  arena: { obstacles: [] },
  projectiles: [],
  beams: [],
  impactSerial: 0,
  beamSerial: 0,
  lastImpact: null,
  recentImpacts: [],
};
advanceRuntimeWeapons(runtime, 'attacker', attacker, defender, 0.08);
assert.equal(runtime.beams.length, 2, 'both loaded bow guns shoot in one tick');
assert.equal(runtime.recentImpacts.length, 2, 'both real hits remain visible');
assert.equal(runtime.recentImpacts[0].weaponFamily, 'front_repeater');
assert.equal(runtime.recentImpacts[1].weaponFamily, 'front_repeater');
assert.equal(attacker.cooldowns[0], 0.2);
assert.equal(attacker.cooldowns[1], 0.2);

attacker.tactic = 'flee';
attacker.cooldowns[0] = 0;
attacker.cooldowns[1] = 0;
advanceRuntimeWeapons(runtime, 'attacker', attacker, defender, 0.08);
assert.equal(runtime.beams.length, 2, 'fleeing never launches offensive repeater shots');

const mixed = createCombatant(setup('mixed', [rail, repeater], fronts), 'attacker', arena);
const far = scoreWeaponPosture(mixed, defender, { focus: 'forward' });
assert(far);
mixed.setup.weapons[1] = {
  ...repeater,
  weapon: { ...repeater.weapon, combatShieldDamage: 0.001, combatHullDamage: 0.001 },
};
const long = scoreWeaponPosture(mixed, defender, { focus: 'forward' });
assert(long && long.effectiveRange > far.effectiveRange, 'long rail prefers a different envelope');

console.log('PASS 28 six-slot ships, universal guns, independent repeater fire and range scoring');
