'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 200,
    hullHp: 200,
    weapons: [],
    hitChance: 0.7,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
  };
}
const arena = {
  width: 2600,
  height: 1500,
  attackerPosition: { x: 1100, y: 750 },
  defenderPosition: { x: 1650, y: 750 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
  exitPoint: { x: 160, y: 750 },
  obstacles: [],
};
const combat = createStrategicCombatService(setup('runner'), setup('hunter'), 86, arena);
combat.tick(0.08);
combat.setTactic('attacker', 'flee');
const initial = combat.getSnapshot();
const first = combat.tick(0.08);
assert.equal(first.attacker.tactic, 'flee');
assert.equal(first.attacker.strategy?.kind, 'escape', 'player order replans immediately');
assert.equal(first.attacker.combatIntent, 'FLIEHEN');
assert(
  first.attacker.velocity.x < initial.attacker.velocity.x,
  'RCS should begin correcting velocity toward exit during a 180-degree turn'
);
const startX = initial.attacker.position.x;
let last = first;
for (let tick = 0; tick < 60 && !last.winner; tick += 1) last = combat.tick(0.08);
assert(last.attacker.position.x < startX - 25, 'flight must progress toward the exit');
assert.equal(last.attacker.tactic, 'flee', 'autonomous review cannot override manual escape');
combat.setTactic('attacker', 'fight');
const resumed = combat.tick(0.08);
assert.equal(resumed.attacker.tactic, 'fight');
assert.notEqual(resumed.attacker.strategy?.kind, 'escape');
for (const heading of [0, Math.PI / 2, Math.PI]) {
  for (const seed of [85, 86]) {
    const duel = createStrategicCombatService(setup('pilot'), setup('pursuer'), seed, {
      ...arena,
      attackerHeadingRadians: heading,
    });
    duel.setTactic('attacker', 'flee');
    let previous = duel.getSnapshot();
    let totalRotation = 0;
    for (let tick = 0; tick < 70 && !previous.winner; tick += 1) {
      const frame = duel.tick(0.08);
      const delta = frame.attacker.headingRadians - previous.attacker.headingRadians;
      totalRotation += Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
      previous = frame;
    }
    assert(
      previous.attacker.position.x < arena.attackerPosition.x - 25,
      'manual flight progresses toward exit across seeds and starting headings'
    );
    assert(totalRotation < Math.PI * 1.75, 'escaping must not spin repeatedly in open space');
  }
}
const blocked = createStrategicCombatService(setup('blocked'), setup('guard'), 86, {
  ...arena,
  attackerPosition: { x: 172, y: 750 },
  defenderPosition: { x: 350, y: 750 },
});
blocked.setTactic('attacker', 'flee');
const blockSnapshot = blocked.tick(0.08);
assert.notDeepEqual(
  blockSnapshot.exitPoint,
  arena.exitPoint,
  'a camped escape gate must reroute instead of demanding thrust against the boundary'
);
assert.equal(blockSnapshot.attacker.tactic, 'flee');
blocked.setTactic('attacker', 'flee');
assert.deepEqual(
  blocked.getSnapshot().exitPoint,
  blockSnapshot.exitPoint,
  'repeating a manual flee order must not discard a viable escape detour'
);
assert.equal(blockSnapshot.winner, null, 'rerouting is not an instant successful escape');
assert(
  blocked.getCombatLog().some((event) => event.detail.includes('FLUCHTKORRIDOR BLOCKIERT')),
  'blocked gate decision must be visible in diagnostic combat logs'
);

console.log('PASS manual flee overrides attack immediately, moves to gate and can be cancelled');
