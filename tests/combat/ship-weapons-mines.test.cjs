'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const catalog = loadStandaloneTypeScriptModule(root, 'src/data/ships/ship-component-catalog.ts');
const combat = loadStandaloneTypeScriptModule(root, 'src/systems/combat/index.ts');

const weapons = catalog.SHIP_COMPONENT_CATALOG.weapon ?? [];
const expectedFamilies = [
  'pulse_laser',
  'plasma_battery',
  'guided_missile',
  'ion_laser',
  'ion_cannon',
  'autocannon',
  'railgun',
  'he_missile',
];

assert.equal(weapons.length, expectedFamilies.length * 6, 'every weapon family needs Mk I-VI');

for (const family of expectedFamilies) {
  const variants = weapons
    .filter((component) => component.weapon?.family === family)
    .sort((left, right) => left.tier - right.tier);

  assert.deepEqual(
    variants.map((component) => component.tier),
    [1, 2, 3, 4, 5, 6],
    family + ' must contain Mk I through Mk VI'
  );

  for (let index = 1; index < variants.length; index += 1) {
    const previous = variants[index - 1].weapon;
    const current = variants[index].weapon;
    assert(
      current.shieldDamage + current.hullDamage >
        previous.shieldDamage + previous.hullDamage,
      family + ' must gain raw damage every Mk'
    );
    assert(
      current.rangeMeters > previous.rangeMeters,
      family + ' must gain range every Mk'
    );
    assert(
      current.cooldownSeconds <= previous.cooldownSeconds,
      family + ' must not fire slower at higher Mk'
    );
  }

  const profile = variants[0].weapon;
  if (profile.role === 'balanced') {
    const ratio =
      Math.min(profile.shieldDamage, profile.hullDamage) /
      Math.max(profile.shieldDamage, profile.hullDamage);
    assert(ratio >= 0.7, family + ' must remain a real all-round weapon');
  } else if (profile.role === 'shield') {
    assert(
      profile.shieldDamage >= profile.hullDamage * 4,
      family + ' must be strongly specialized against shields'
    );
  } else {
    assert(
      profile.hullDamage >= profile.shieldDamage * 4,
      family + ' must be strongly specialized against hull'
    );
  }
}

{
  const mk1 = weapons.find((component) => component.id === 'weapon1');
  const mk6 = weapons.find((component) => component.id === 'weapon6');
  assert(mk1?.weapon && mk6?.weapon, 'legacy weapon1-weapon6 ids must remain valid');
  assert.equal(mk1.weapon.family, 'pulse_laser');
  assert.equal(mk6.weapon.family, 'pulse_laser');
  assert(mk6.weapon.shieldDamage > mk1.weapon.shieldDamage);
  assert(mk6.weapon.hullDamage > mk1.weapon.hullDamage);
}

{
  const ion = weapons.find((component) => component.id === 'weapon-ion-cannon-1');
  const railgun = weapons.find((component) => component.id === 'weapon-railgun-1');
  assert(ion?.weapon && railgun?.weapon);

  const ionHit = combat.resolveShipWeaponHit(ion, { shieldHp: 100, hullHp: 100 });
  assert.equal(ionHit.shieldDamage, 46);
  assert.equal(ionHit.hullDamage, 0);
  assert.equal(ionHit.hullRemaining, 100);

  const blockedRailgun = combat.resolveShipWeaponHit(railgun, {
    shieldHp: 100,
    hullHp: 100,
  });
  assert.equal(blockedRailgun.shieldDamage, 5);
  assert.equal(blockedRailgun.hullDamage, 0);

  const exposedRailgun = combat.resolveShipWeaponHit(railgun, {
    shieldHp: 0,
    hullHp: 100,
  });
  assert.equal(exposedRailgun.shieldDamage, 0);
  assert.equal(exposedRailgun.hullDamage, 48);
}

assert.equal(combat.SHIP_MINE_CATALOG.length, 18, 'three mine kinds need Mk I-VI');

for (const kind of ['ion', 'shaped_charge', 'hunter']) {
  const mines = combat
    .getShipMinesByKind(kind)
    .slice()
    .sort((left, right) => left.tier - right.tier);

  assert.deepEqual(
    mines.map((mine) => mine.tier),
    [1, 2, 3, 4, 5, 6],
    kind + ' mines must contain Mk I through Mk VI'
  );

  for (let index = 1; index < mines.length; index += 1) {
    const previous = mines[index - 1];
    const current = mines[index];
    assert(
      current.shieldDamage + current.hullDamage >
        previous.shieldDamage + previous.hullDamage,
      kind + ' mines must gain raw damage every Mk'
    );
    assert(current.stealth >= previous.stealth, kind + ' mines must not become easier to detect');
  }
}

{
  const ionMine = combat.getShipMine('mine-ion-1');
  const shapedMine = combat.getShipMine('mine-shaped-charge-1');
  const hunterMk6 = combat.getShipMine('mine-hunter-6');
  assert(ionMine && shapedMine && hunterMk6);

  assert(ionMine.shieldDamage >= ionMine.hullDamage * 4);
  assert(shapedMine.hullDamage >= shapedMine.shieldDamage * 4);

  const lowSkill = combat.detectShipMine(ionMine, {
    crewSkill: 20,
    sensorTier: 1,
    sensorRangeMeters: 1000,
    sensorRangeMultiplier: 1,
    distanceMeters: 10,
  });
  assert.equal(lowSkill.level, 'hidden', 'weak sensor crews must completely miss mines');

  const trainedCrew = combat.detectShipMine(ionMine, {
    crewSkill: 64,
    sensorTier: 1,
    sensorRangeMeters: 1000,
    sensorRangeMultiplier: 1,
    distanceMeters: 300,
  });
  assert.equal(trainedCrew.level, 'mine', 'trained crew should detect but not fully identify it');

  const eliteCrew = combat.detectShipMine(hunterMk6, {
    crewSkill: 92,
    sensorTier: 3,
    sensorRangeMeters: 1000,
    sensorRangeMultiplier: 1.3,
    distanceMeters: 400,
  });
  assert.equal(
    eliteCrew.level,
    'identified',
    'elite sensor crews with upgraded arrays should identify hunter mines'
  );

  const ionHit = combat.resolveShipMineHit(ionMine, { shieldHp: 100, hullHp: 100 });
  assert.equal(ionHit.shieldDamage, 65);
  assert.equal(ionHit.hullDamage, 0);

  const shapedHit = combat.resolveShipMineHit(shapedMine, { shieldHp: 0, hullHp: 100 });
  assert.equal(shapedHit.shieldDamage, 0);
  assert.equal(shapedHit.hullDamage, 75);
}

console.log('PASS Mk I-VI ship weapons, layered damage, mines and crew sensor detection');
