'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const { SHIP_MINE_CATALOG } = loadStandaloneTypeScriptModule(root, 'src/data/combat/ship-mines.ts');
const { nativeWeaponDamage, nativeMineDamage } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-native-damage.ts'
);
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { applyDamage } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const arena = {
  width: 1800,
  height: 1000,
  attackerPosition: { x: 400, y: 500 },
  defenderPosition: { x: 1000, y: 500 },
};
// Frozen pre-migration raw Mk I damage; do not derive expected values from
// the catalog under test, or a broken migration could pass unchanged.
const baseline = 0.18;
const tierScale = [1, 1.3, 1.65, 2.05, 2.5, 3];
const weaponBase = {
  pulse_laser: [15, 15],
  plasma_battery: [24, 24],
  guided_missile: [18, 25],
  ion_laser: [30, 6],
  ion_cannon: [50, 3],
  autocannon: [8, 34],
  railgun: [5, 300],
  he_missile: [10, 48],
};
const mineBase = {
  ion: [65, 5],
  shaped_charge: [10, 75],
  hunter: [40, 40],
};
const referenceRaw = (base, tier) => Math.max(1, Math.round(base * tierScale[tier - 1]));
const expected = (raw, crew, critical) => Math.max(1, raw * baseline * crew * (critical ? 1.5 : 1));
function ship(id, side, hp, crew) {
  return createCombatant(
    {
      id,
      name: id,
      shipId: 'patrol',
      shieldHp: hp,
      hullHp: 2000,
      weapons: [],
      hitChance: 1,
      dodgeChance: 0,
      damageMultiplier: crew,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
    },
    side,
    arena
  );
}
for (const component of SHIP_COMPONENT_CATALOG.weapon) {
  const profile = nativeWeaponDamage(component);
  assert(profile, component.id + ' missing weapon profile');
  for (const [crew, critical] of [
    [0.75, false],
    [1, false],
    [1.2, true],
  ]) {
    const attacker = ship('attacker', 'attacker', 0, crew);
    const target = ship('target', 'defender', 0, 1);
    const hit = applyDamage(
      target,
      profile.shieldDamage,
      profile.hullDamage,
      attacker,
      critical,
      attacker.position,
      'laser',
      1
    );
    const raw = referenceRaw(weaponBase[component.weapon.family][1], component.tier);
    assert(
      Math.abs(profile.hullDamage - raw * baseline) < 0.000001,
      component.id + ': precomputed weapon damage differs from pre-migration raw value'
    );
    assert(
      Math.abs(hit.damage - expected(raw, crew, critical)) < 0.000001,
      component.id + ': hull damage differs from original balance'
    );
    const shieldTarget = ship('shield-target', 'defender', 2000, 1);
    const shieldHit = applyDamage(
      shieldTarget,
      profile.shieldDamage,
      profile.hullDamage,
      attacker,
      critical,
      attacker.position,
      'laser',
      2
    );
    const shieldRaw = referenceRaw(weaponBase[component.weapon.family][0], component.tier);
    assert.equal(shieldHit.layer, 'shield');
    assert(
      Math.abs(shieldHit.damage - expected(shieldRaw, crew, critical)) < 0.000001,
      component.id + ': shield damage differs from original balance'
    );
    assert.equal(shieldTarget.hullHp, 2000, 'shield hits cannot bypass hull protection');
  }
}
for (const mine of SHIP_MINE_CATALOG) {
  const attacker = ship('attacker', 'attacker', 0, 1);
  const target = ship('target', 'defender', 0, 1);
  const native = nativeMineDamage(mine);
  const hit = applyDamage(
    target,
    native.shieldDamage,
    native.hullDamage,
    attacker,
    false,
    attacker.position,
    'missile',
    1
  );
  const raw = referenceRaw(mineBase[mine.kind][1], mine.tier);
  assert(
    Math.abs(native.hullDamage - raw * baseline) < 0.000001,
    mine.id + ': precomputed combat mine damage differs'
  );
  assert.equal(mine.hullDamage, raw, 'shared noncombat mine catalog must retain original damage');
  assert(
    Math.abs(hit.damage - expected(raw, 1, false)) < 0.000001,
    mine.id + ': mine damage differs from original balance'
  );
}
const damageSource = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-damage.ts'),
  'utf8'
);
assert(
  !damageSource.includes('COMBAT_DAMAGE_SCALE'),
  'global combat factor no longer used on impact'
);
const catalogSource = fs.readFileSync(
  path.join(root, 'src/data/ships/ship-component-catalog.ts'), 'utf8'
);
const mineSource = fs.readFileSync(path.join(root, 'src/data/combat/ship-mines.ts'), 'utf8');
const nativeSource = fs.readFileSync(path.join(root, 'src/systems/combat/combat-native-damage.ts'), 'utf8');
assert(catalogSource.includes('combatShieldDamage: seed.nativeShieldDamage[index]!'),
  'weapon native values belong in canonical component definitions');
assert(mineSource.includes('combatHullDamage: seed.nativeHullDamage[index]!'),
  'mine native values belong in canonical mine definitions');
assert(!nativeSource.includes('WEAPON_DAMAGE:') && !nativeSource.includes('MINE_DAMAGE:'),
  'no duplicate native-damage lookup table');
console.log('PASS native damage matches old shield/hull baselines for weapon and mine tiers');
