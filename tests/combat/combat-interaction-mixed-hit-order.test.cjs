'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const damage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const arena = {
  width: 1800,
  height: 1100,
  attackerPosition: { x: 400, y: 550 },
  defenderPosition: { x: 900, y: 550 },
};
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-test',
  shieldHp: 60,
  hullHp: 120,
  weapons: [],
  hitChance: 1,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  combatSpeed: 100,
});
const attacker = geometry.createCombatant(setup('attacker'), 'attacker', arena);
const defender = geometry.createCombatant(setup('defender'), 'defender', arena);
const sources = [
  { source: 'laser', shield: 30, hull: 14 },
  { source: 'missile', shield: 400, hull: 30 },
  { source: 'laser', shield: 20, hull: 35 },
];
const initialHull = defender.hullHp;
const first = damage.applyDamage(
  defender,
  sources[0].shield,
  sources[0].hull,
  attacker,
  false,
  attacker.position,
  sources[0].source,
  1
);
assert.equal(first.layer, 'shield');
assert.equal(defender.hullHp, initialHull, 'laser cannot bypass active shield');
const second = damage.applyDamage(
  defender,
  sources[1].shield,
  sources[1].hull,
  attacker,
  false,
  attacker.position,
  sources[1].source,
  2
);
assert.equal(second.layer, 'shield', 'missile impacts remaining shield before hull');
assert.equal(defender.shieldHp, 0, 'second weapon depletes shield');
assert.equal(defender.hullHp, initialHull, 'shield phase does not apply hull damage');
const third = damage.applyDamage(
  defender,
  sources[2].shield,
  sources[2].hull,
  attacker,
  false,
  attacker.position,
  sources[2].source,
  3
);
assert.equal(third.layer, 'hull', 'next hit damages exposed hull');
assert(defender.hullHp < initialHull);
assert(defender.hullHp >= 0);
assert.equal(defender.shieldImpacts.length, 2, 'both shield hits retain distinct impact visuals');
const { advanceRuntimeProjectiles } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-weapons.ts'
);
for (const [coverX, expected] of [
  [347, 'obstacle'],
  [427, 'hull'],
]) {
  const exposed = geometry.createCombatant({ ...setup('exposed'), shieldHp: 0 }, 'defender', {
    ...arena,
    defenderPosition: { x: 400, y: 500 },
  });
  const runtime = {
    attacker,
    defender: exposed,
    impactSerial: 0,
    recentImpacts: [],
    arena: { ...arena, obstacles: [{ id: 'cover', position: { x: coverX, y: 500 }, radius: 2 }] },
    projectiles: [
      {
        owner: 'attacker',
        kind: 'autocannon',
        family: 'autocannon',
        position: { x: 340, y: 500 },
        direction: { x: 1, y: 0 },
        speed: 1200,
        ttlSeconds: 3,
        shieldDamage: 10,
        hullDamage: 20,
        weaponIndex: 0,
      },
    ],
  };
  advanceRuntimeProjectiles(runtime, 0.08);
  assert.equal(runtime.lastImpact.layer, expected, 'the first body along the projectile step wins');
}
console.log('PASS mixed laser and missile impact ordering, shield depletion and exposed hull');
