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
assert(
  Math.abs(secondOpponent.tractorThrowCooldown - (2 - 0.08 * 3)) < 1e-9,
  'support fighter cooldown must not be ticked twice after retarget'
);
secondOpponent.hullHp = 0;
oneVsTwo.tick(0.08);
assert.equal(oneVsTwo.getSnapshot().finished, true);
assert.equal(
  oneVsTwo
    .getSnapshot()
    .duels[0].arena.asteroids.filter((rock) => rock.id.startsWith('fleet-wreck:')).length,
  2,
  'both defeated attackers each leave one physical wreck'
);

// The additional ship must really fire on the shared hull using the EXISTING
// native weapon engine, not merely appear as a second ship on the screen.
const pulse = {
  id: 'weapon1',
  type: 'weapon',
  name: 'Pulse Laser Mk I',
  tier: 1,
  power: 5,
  cost: 0,
  weapon: {
    family: 'pulse_laser',
    role: 'balanced',
    shieldDamage: 15,
    hullDamage: 15,
    combatShieldDamage: 20,
    combatHullDamage: 20,
    rangeMeters: 4200,
    cooldownSeconds: 0.7,
    heat: 0,
    ammoPerShot: 0,
    mount: 'turret',
    arcDegrees: 360,
  },
};
const firstGunner = ship('gunner1', 'b');
firstGunner.setup.weapons = [pulse];
firstGunner.setup.hitChance = 1;
const extraGunner = ship('gunner2', 'b');
extraGunner.setup.weapons = [pulse];
extraGunner.setup.hitChance = 1;
const liveFire = createParallelNativeDuels(
  [ship('victim', 'a'), firstGunner, extraGunner],
  arena(),
  719
);
const sharedVictim = liveFire.duels[0].getParallelActor('attacker');
const shooter = liveFire.supporters[0].getParallelActor('attacker');
sharedVictim.position = { x: 2100, y: 1600 };
shooter.position = { x: 2800, y: 1600 };
shooter.cooldowns[0] = 0;
const startingShield = sharedVictim.shieldHp;
for (let i = 0; i < 30; i += 1) liveFire.tick(0.08);
assert(
  liveFire.duels[0].getParallelActor('defender').weaponTelemetry[0].shotsFired > 0,
  'the first attacker must also fire in the original 1vs1 service'
);
assert(
  shooter.weaponTelemetry[0].shotsFired > 0,
  'native extra attacker must actually fire real weapons'
);
assert(
  sharedVictim.shieldHp < startingShield,
  'extra attacker must damage the SAME real ship owned by the original duel'
);
assert.strictEqual(liveFire.supporters[0].getParallelActor('defender'), sharedVictim);

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

// In the same 1v2 battle the first attacker may ESCAPE rather than die.
const persistentEscape = createParallelNativeDuels(
  [ship('solo', 'a'), ship('fugitive', 'b'), ship('remaining', 'b')],
  arena(),
  72
);
const exit = persistentEscape.getSnapshot().duels[0].exitPoint;
const escapingShip = persistentEscape.duels[0].getParallelActor('defender');
const deltaX = 2100 - exit.x;
const deltaY = 1300 - exit.y;
const length = Math.max(1, Math.hypot(deltaX, deltaY));
escapingShip.position.x = exit.x + (deltaX / length) * 55;
escapingShip.position.y = exit.y + (deltaY / length) * 55;
escapingShip.tactic = 'flee';
escapingShip.combatTacticLocked = true;
persistentEscape.tick(0.08);
assert(
  persistentEscape.getSnapshot().escapedShipIds.includes('fugitive'),
  'the original opponent reaches the one shared exit gate'
);
assert.equal(
  persistentEscape.duels[0].getParallelActor('defender').setup.id,
  'remaining',
  'the original survivor must fight the next live attacker after an escape'
);
persistentEscape.tick(0.08);
assert(
  persistentEscape.getSnapshot().escapedShipIds.includes('fugitive'),
  'an escaped ship must remain excluded even when its old duel is retargeted'
);

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
