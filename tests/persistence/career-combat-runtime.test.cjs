'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');

const weapon = {
  id: 'career-test-laser',
  type: 'weapon',
  name: 'Laser',
  tier: 1,
  power: 1,
  cost: 0,
  weapon: {
    family: 'pulse_laser',
    role: 'balanced',
    shieldDamage: 12,
    hullDamage: 10,
    rangeMeters: 900,
    cooldownSeconds: 0.5,
    heat: 1,
    ammoPerShot: 0,
  },
};
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-60m-variant-01',
  shieldHp: 120,
  hullHp: 200,
  weapons: [weapon],
  hitChance: 0.8,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  aiControlled: true,
  preferredTactic: 'fight',
});
const arena = { width: 1800, height: 1200 };
const attacker = setup('career-player');
const defender = setup('career-pirate');
const initial = createStrategicCombatService(attacker, defender, 431, arena);
for (let i = 0; i < 30; i += 1) initial.tick(0.08);
const saved = initial.exportCareerState();
assert(saved.randomCalls >= 0);
const restored = createStrategicCombatService(
  attacker,
  defender,
  431,
  arena,
  JSON.parse(JSON.stringify(saved))
);
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.getSnapshot())),
  JSON.parse(JSON.stringify(initial.getSnapshot()))
);
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.exportCareerState())),
  JSON.parse(JSON.stringify(saved))
);
for (let i = 0; i < 100; i += 1) {
  const original = initial.tick(0.08);
  const resumed = restored.tick(0.08);
  assert.deepEqual(
    JSON.parse(JSON.stringify(resumed)),
    JSON.parse(JSON.stringify(original)),
    'saved runtime must resume identical physics and random outcomes'
  );
  if (original.winner) break;
}
const damaged = JSON.parse(JSON.stringify(saved));
damaged.runtime.attacker.hullHp = -10;
assert.throws(
  () => createStrategicCombatService(attacker, defender, 431, arena, damaged),
  /combat runtime checkpoint/
);
const wrongEnemy = { ...saved, defenderId: 'another-ship' };
assert.throws(
  () => createStrategicCombatService(attacker, defender, 431, arena, wrongEnemy),
  /combat runtime checkpoint/
);
console.log('PASS combat career runtime: full physics, RNG and damage resume deterministically');
