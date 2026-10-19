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
// Explicit expected real-time damage per Mk, frozen after the intentional rebalance.
const tierScale = [1, 1.3, 1.65, 2.05, 2.5, 3];
const weaponExpected = {
  pulse_laser: { shield: [4, 5.2, 6.6, 8.2, 10, 12], hull: [4, 5.2, 6.6, 8.2, 10, 12] },
  front_repeater: { shield: [1.75, 2.28, 2.89, 3.59, 4.38, 5.25], hull: [1.75, 2.28, 2.89, 3.59, 4.38, 5.25] },
  flux_projector: { shield: [15, 19.5, 24.75, 30.75, 37.5, 45], hull: [1, 1.3, 1.65, 2.05, 2.5, 3] },
  plasma_battery: { shield: [12, 15.6, 19.8, 24.6, 30, 36], hull: [12, 15.6, 19.8, 24.6, 30, 36] },
  guided_missile: { shield: [5, 6.5, 8.25, 10.25, 12.5, 15], hull: [8, 10.4, 13.2, 16.4, 20, 24] },
  ion_laser: { shield: [8, 10.4, 13.2, 16.4, 20, 24], hull: [1, 1.3, 1.65, 2.05, 2.5, 3] },
  ion_cannon: { shield: [16, 20.8, 26.4, 32.8, 40, 48], hull: [1, 1.3, 1.65, 2.05, 2.5, 3] },
  autocannon: { shield: [2, 2.6, 3.3, 4.1, 5, 6], hull: [8, 10.4, 13.2, 16.4, 20, 24] },
  railgun: { shield: [0.9, 1.26, 1.44, 1.8, 2.34, 2.7], hull: [54, 70.2, 89.1, 110.7, 135, 162] },
  he_missile: { shield: [2, 2.6, 3.3, 4.1, 5, 6], hull: [18, 23.4, 29.7, 36.9, 45, 54] },
};
const baseline = 0.18;
const mineBase = {
  ion: [65, 5],
  shaped_charge: [10, 75],
  hunter: [40, 40],
};
const referenceRaw = (base, tier) => Math.max(1, Math.round(base * tierScale[tier - 1]));
const expected = (raw, crew, critical) => Math.max(1, raw * crew * (critical ? 1.5 : 1));
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
    const reference = weaponExpected[component.weapon.family];
    assert(reference, component.id + ': missing explicit Mk baseline');
    const expectedHull = reference.hull[component.tier - 1];
    assert(
      Math.abs(profile.hullDamage - expectedHull) < 0.000001,
      component.id + ': native hull damage differs from the approved combat profile'
    );
    assert(
      Math.abs(hit.damage - expected(expectedHull, crew, critical)) < 0.000001,
      component.id + ': actual hull hit differs from the approved combat profile'
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
    const expectedShield = reference.shield[component.tier - 1];
    assert.equal(shieldHit.layer, 'shield');
    assert(
      Math.abs(shieldHit.damage - expected(expectedShield, crew, critical)) < 0.000001,
      component.id + ': actual shield hit differs from the approved combat profile'
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
    Math.abs(hit.damage - expected(raw * baseline, 1, false)) < 0.000001,
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
  path.join(root, 'src/data/ships/ship-component-catalog.ts'),
  'utf8'
);
const mineSource = fs.readFileSync(path.join(root, 'src/data/combat/ship-mines.ts'), 'utf8');
const nativeSource = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-native-damage.ts'),
  'utf8'
);
assert(
  catalogSource.includes('combatShieldDamage: seed.nativeShieldDamage[index]!'),
  'weapon native values belong in canonical component definitions'
);
assert(
  mineSource.includes('combatHullDamage: seed.nativeHullDamage[index]!'),
  'mine native values belong in canonical mine definitions'
);
assert(
  !nativeSource.includes('WEAPON_DAMAGE:') && !nativeSource.includes('MINE_DAMAGE:'),
  'no duplicate native-damage lookup table'
);
console.log('PASS native damage matches approved weapon rebalancing and legacy mine tiers');
