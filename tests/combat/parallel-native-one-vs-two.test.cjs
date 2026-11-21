'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createParallelNativeDuels } = load('src/systems/combat/parallel-native-duels.ts');
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');

function ship(id, team) {
  return {
    id,
    team,
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m',
      shieldHp: 400,
      hullHp: 500,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 110,
      preferredTactic: 'fight',
    },
  };
}
const arena = () => ({ width: 4200, height: 2600, obstacles: [], asteroids: [] });

const oneVsTwo = createParallelNativeDuels(
  [ship('a1', 'a'), ship('b1', 'b'), ship('b2', 'b')],
  arena(),
  992
);
assert.equal(oneVsTwo.duels.length, 1, '1v2 is one original 1v1 pair, NOT two copied defenders');
assert.equal(oneVsTwo.supporters.length, 1, 'one extra ship has its own native attack driver');
const primary = oneVsTwo.duels[0];
const extra = oneVsTwo.supporters[0];
const lone = primary.getParallelActor('attacker');
const firstOpponent = primary.getParallelActor('defender');
const secondOpponent = extra.getParallelActor('attacker');
assert.strictEqual(extra.getParallelActor('defender'), lone);
assert.notStrictEqual(firstOpponent, secondOpponent);
for (const actor of [lone, firstOpponent, secondOpponent]) actor.tractorThrowCooldown = 2;
oneVsTwo.tick(0.08);
for (const actor of [lone, firstOpponent, secondOpponent]) {
  assert.equal(actor.tractorThrowCooldown, 1.92, 'each real ship ticks its cooldown once');
}
assert.equal(primary.getSnapshot().elapsedSeconds, 0.08);
assert.equal(extra.getSnapshot().elapsedSeconds, 0.08);

// Remove the initial opponent. The surviving real ship must keep fighting the
// second attacker with the SAME hull/power/motion state, not spawn a clone.
firstOpponent.hullHp = 0;
oneVsTwo.tick(0.08);
assert.strictEqual(primary.getParallelActor('attacker'), lone);
assert.strictEqual(primary.getParallelActor('defender'), secondOpponent);
assert.strictEqual(extra.getParallelActor('attacker'), secondOpponent);
assert.strictEqual(extra.getParallelActor('defender'), lone);
assert.equal(primary.getSnapshot().winner, null, '1v2 survivor must not freeze at first duel end');
assert.equal(
  oneVsTwo.getSnapshot().duels[0].defender.id,
  'b2',
  'original pair now points at the actual surviving second attacker'
);
assert.equal(
  oneVsTwo.getSnapshot().duels[0].arena.asteroids.filter((rock) => rock.id === 'fleet-wreck:b1')
    .length,
  1
);
const survivorTime = primary.getSnapshot().elapsedSeconds;
oneVsTwo.tick(0.08);
assert(primary.getSnapshot().elapsedSeconds > survivorTime, 'original survivor continues moving');
assert.equal(
  secondOpponent.tractorThrowCooldown,
  2 - 0.08 * 3,
  'support fighter cooldown must not be ticked twice after retarget'
);
secondOpponent.hullHp = 0;
oneVsTwo.tick(0.08);
assert.equal(oneVsTwo.getSnapshot().finished, true);
assert.equal(
  oneVsTwo.getSnapshot().duels[0].arena.asteroids.filter((rock) =>
    rock.id.startsWith('fleet-wreck:')
  ).length,
  2,
  'both defeated attackers each leave one physical wreck'
);

// Reverse ownership: now the one defending ship must survive the first of
// TWO incoming attackers. This exercises a defender-only continuation tick.
const twoVsOne = createParallelNativeDuels(
  [ship('a1', 'a'), ship('a2', 'a'), ship('b1', 'b')],
  arena(),
  109
);
const defender = twoVsOne.duels[0].getParallelActor('defender');
const extraAttacker = twoVsOne.supporters[0].getParallelActor('attacker');
assert.strictEqual(twoVsOne.supporters[0].getParallelActor('defender'), defender);
twoVsOne.duels[0].getParallelActor('attacker').hullHp = 0;
twoVsOne.tick(0.08);
assert.strictEqual(twoVsOne.duels[0].getParallelActor('defender'), defender);
assert.strictEqual(twoVsOne.duels[0].getParallelActor('attacker'), extraAttacker);
assert.equal(twoVsOne.duels[0].getSnapshot().winner, null);
defender.tractorThrowCooldown = 2;
extraAttacker.tractorThrowCooldown = 2;
twoVsOne.tick(0.08);
assert.equal(defender.tractorThrowCooldown, 1.92);
assert.equal(extraAttacker.tractorThrowCooldown, 1.92);
extraAttacker.hullHp = 0;
twoVsOne.tick(0.08);
assert(twoVsOne.getSnapshot().finished, 'surviving defender concludes the true 2v1 encounter');

// Multiple reinforcements reuse the same lone ship with successive living
// opponents instead of introducing a new ship instance after every kill.
const oneVsThree = createParallelNativeDuels(
  [ship('solo', 'a'), ship('e1', 'b'), ship('e2', 'b'), ship('e3', 'b')],
  arena(),
  55
);
const sameSolo = oneVsThree.duels[0].getParallelActor('attacker');
for (const enemy of ['e1', 'e2']) {
  const liveTarget = oneVsThree.duels[0].getParallelActor('defender');
  assert.equal(liveTarget.setup.id, enemy);
  liveTarget.hullHp = 0;
  oneVsThree.tick(0.08);
  assert.strictEqual(oneVsThree.duels[0].getParallelActor('attacker'), sameSolo);
  assert.equal(oneVsThree.duels[0].getSnapshot().winner, null);
}
assert.equal(oneVsThree.duels[0].getParallelActor('defender').setup.id, 'e3');

// In contrast, 2v2 remains two completely separate, original 1v1 pairs.
const twoVsTwo = createParallelNativeDuels(
  [ship('a1', 'a'), ship('a2', 'a'), ship('b1', 'b'), ship('b2', 'b')],
  arena(),
  17
);
assert.equal(twoVsTwo.duels.length, 2);
assert.equal(twoVsTwo.supporters.length, 0);
const independent = twoVsTwo.duels[1].getParallelActor('defender');
twoVsTwo.duels[0].getParallelActor('defender').hullHp = 0;
twoVsTwo.tick(0.08);
assert.equal(twoVsTwo.duels[0].getSnapshot().winner, 'attacker');
assert.strictEqual(twoVsTwo.duels[1].getParallelActor('defender'), independent);
assert.equal(twoVsTwo.duels[1].getSnapshot().winner, null);

// Fleet-only transition cannot restart or repoint an ordinary 1v1 duel.
const normal = createStrategicCombatService(
  ship('n1', 'a').setup,
  ship('n2', 'b').setup,
  100,
  arena()
);
normal.getParallelActor('defender').hullHp = 0;
normal.tick(0.08);
assert.equal(
  normal.retargetParallelSurvivor('attacker', secondOpponent),
  false,
  'regular 1v1 never enables Fleet retargeting'
);

console.log('PASS true 1v2/2v1, shared AI owner, cooldowns, next opponent, 2v2 isolation');
