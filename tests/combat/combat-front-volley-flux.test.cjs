'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');
const { getShipComponent, createShipyardVariantId } = load(
  'src/systems/ships/ship-component-service.ts'
);
const fire = load('src/systems/combat/combat-weapon-fire-control.ts');
const { createCombatant } = load('src/systems/combat/strategic-combat-geometry.ts');
const { WEAPON_VISUALS } = load('src/core/weapon-visual-profiles.ts');
const fx = load('src/ui/combat/combat-flux-projector-fx.ts');

const weapon = (id) => SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
const repeater = weapon('weapon-front-repeater-1');
const flux = weapon('weapon-flux-projector-1');
const rail = weapon('weapon-railgun-1');
assert(repeater && flux && rail);
assert.equal(repeater.weapon.combatShieldDamage, 1.75);
assert.equal(repeater.weapon.combatHullDamage, 1.75);
assert.equal(flux.weapon.combatShieldDamage, 15);
assert.equal(flux.weapon.combatHullDamage, 1);
assert.equal(flux.weapon.mount, 'forward');
assert.equal(WEAPON_VISUALS.flux_projector.beamSeconds, 0.45);

function ship(id, weapons, shieldHp = 80) {
  const setup = {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp,
    hullHp: 350,
    weapons,
    hitChance: 0.98,
    dodgeChance: 0,
    criticalChance: 0,
    damageMultiplier: 1,
    cycleTimeMultiplier: 1,
  };
  return createCombatant(setup, id === 'target' ? 'defender' : 'attacker', {
    width: 1900,
    height: 1200,
  });
}

const target = ship('target', []);
const rapid = ship('rapid', [repeater, repeater]);
rapid.cooldowns.fill(0);
const choices = (owner) => owner.setup.weapons.map((component, index) => ({ component, index }));
assert.deepEqual(fire.selectFireControlVolley(rapid, target, choices(rapid), 5), [0, 1]);
assert(Math.abs(3.5 / 0.65 - 5.384615) < 0.00001);
assert.equal(fire.effectiveWeaponCycleSeconds(repeater.weapon, 1), 0.65);
fire.commitFireControlVolley(rapid, 5, [0, 1]);
assert.deepEqual(fire.selectFireControlVolley(rapid, target, choices(rapid), 5.6), []);

const heavy = ship('heavy', [rail, rail], 0);
heavy.cooldowns.fill(0);
assert.deepEqual(fire.selectFireControlVolley(heavy, target, choices(heavy), 5), [0, 1]);
const mixed = ship('mixed', [flux, rail]);
mixed.cooldowns.fill(0);
assert.deepEqual(
  fire.selectFireControlVolley(mixed, target, choices(mixed), 5),
  [0],
  'shield breaker preserves rail charge while target shields remain strong'
);
target.shieldHp = 0;
assert.deepEqual(
  fire.selectFireControlVolley(mixed, target, choices(mixed), 5),
  [1],
  'railgun dominates against exposed hull'
);

const yardId = createShipyardVariantId('weapon', repeater.id, 'damage', 20);
assert(yardId, 'damage variant is permitted');
const upgraded = getShipComponent('weapon', yardId);
assert.equal(upgraded.weapon.combatShieldDamage, 2.1);
assert.equal(upgraded.weapon.combatHullDamage, 2.1);

const check = {
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  stroke() {
    this.strokes += 1;
  },
  strokes: 0,
};
fx.drawFluxProjectorPulse(check, { x: 0, y: 0 }, { x: 200, y: 0 }, 0.08);
fx.drawFluxProjectorImpact(check, { x: 200, y: 0 }, 0.15, 7, true);
assert(check.strokes >= 10, 'flux has independent firing and impact effects');

const mountsDir = path.join(root, 'src/data/ships');
const mounts = fs.readdirSync(mountsDir).filter((name) => name.endsWith('.hardpoints.json'));
assert.equal(mounts.length, 28);
for (const file of mounts) {
  const points = JSON.parse(fs.readFileSync(path.join(mountsDir, file), 'utf8'));
  const fronts = points.weaponMounts.filter(
    (entry) => entry.allowedMounts && entry.allowedMounts.includes('forward')
  );
  assert(fronts.length >= 1, file + ' has a bow hardpoint');
  assert(
    fronts.every((entry) => entry.allowedFamilies.includes('flux_projector')),
    file + ' permits the shield projector on its bow'
  );
}
console.log('PASS front salvo, Flux Mk I, variant combat damage and distinct weapon FX');
