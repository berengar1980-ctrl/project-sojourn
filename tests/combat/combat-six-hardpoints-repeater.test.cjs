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
assert.equal(repeater.weapon.shieldDamage, 6, 'catalog damage scales with the rebalance');
assert.equal(repeater.weapon.hullDamage, 6, 'catalog hull damage scales with the rebalance');

const repeaterDamageByTier = [1, 1.3, 1.65, 2.05, 2.5, 3];
for (let tier = 1; tier <= 6; tier += 1) {
  const current = weapon(`weapon-front-repeater-${tier}`).weapon;
  const expectedDamage = repeaterDamageByTier[tier - 1];
  assert.equal(current.combatShieldDamage, expectedDamage, 'shield damage Mk ' + tier);
  assert.equal(current.combatHullDamage, expectedDamage, 'hull damage Mk ' + tier);
}
assert.equal(repeater.weapon.combatShieldDamage / repeater.weapon.cooldownSeconds, 5);
assert.equal(repeater.weapon.combatHullDamage / repeater.weapon.cooldownSeconds, 5);

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
    const roleByName = {
      'patrol-60m': 'patrol',
      'miner-80m': 'mining',
      'freighter-120m': 'freighter',
      'salvage-100m': 'salvage',
    };
    const role = roleByName[name];
    const ship = { id, role, nominalLengthMeters: 80, sprite: { hardpoints: points } };
    for (const slot of [0, 5]) {
      const allowed = slot === 0 || role === 'patrol';
      assert.equal(fitsWeaponHardpoint(ship, slot, repeater.weapon), allowed);
      assert.equal(fitsWeaponHardpoint(ship, slot, rail.weapon), allowed);
      assert(!fitsWeaponHardpoint(ship, slot, missile.weapon), id + ': no front missiles');
    }
    for (const slot of [1, 2]) {
      const sideWeapon = slot === 1 ? plasma.weapon : autocannon.weapon;
      assert(fitsWeaponHardpoint(ship, slot, sideWeapon), id + ': broadside mount active');
    }
    for (const slot of [3, 4]) {
      assert.equal(mounts[slot].arcDegrees, 360);
      const allowed = role === 'patrol' || (role === 'freighter' && slot === 3);
      assert.equal(fitsWeaponHardpoint(ship, slot, ion.weapon), allowed);
      assert.equal(fitsWeaponHardpoint(ship, slot, missile.weapon), allowed);
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
    const expected = name.startsWith('patrol') ? 6 : name.startsWith('freighter') ? 4 : 3;
    assert.equal(fitted.length, expected, id + ': only role-authorized mounts resolve');
    const world = combatWeaponMounts(ship, fitted);
    assert.equal(world.length, expected);
    if (expected === 6) {
      assert.notDeepEqual(world[0], world[5], id + ': bow muzzles are physically separate');
    }
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
const attacker = createCombatant(
  setup('attacker', [repeater, repeater], fronts),
  'attacker',
  arena
);
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
assert.equal(runtime.beams.length, 1, 'rapid bow guns share deliberately paced fire decisions');
assert.equal(runtime.recentImpacts.length, 1, 'one real hit is recorded for one released shot');
assert.equal(runtime.recentImpacts[0].weaponFamily, 'front_repeater');
assert.equal(attacker.cooldowns[0], 0.2);
assert.equal(attacker.cooldowns[1], 0, 'unfired mount keeps its independent reload');

runtime.elapsedSeconds = 1.8;
advanceRuntimeWeapons(runtime, 'attacker', attacker, defender, 0.08);
assert.equal(runtime.beams.length, 2, 'the second repeater can fire on the next control decision');
assert.equal(runtime.recentImpacts.length, 2, 'consecutive impacts remain independently recorded');

attacker.tactic = 'flee';
attacker.cooldowns[0] = 0;
attacker.cooldowns[1] = 0;
runtime.elapsedSeconds = 3;
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

console.log('PASS 28 six-slot ships, coordinated repeater cadence and range scoring');
