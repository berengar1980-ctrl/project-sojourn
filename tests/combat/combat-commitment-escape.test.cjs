'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { reviewCombatCommitment, estimatedVictoryChance, escapeViability, usefulEscapeMine } =
  loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-commitment.ts');
const ship = (id, x, weapons = []) => ({
  setup: {
    id,
    name: id,
    shipId: id,
    aiControlled: true,
    aiAggression: 50,
    weapons,
    combatSpeed: id.startsWith('freight') ? 90 : 120,
  },
  position: { x, y: 500 },
  velocity: { x: 0, y: 0 },
  shieldHp: 80,
  shieldMaxHp: 100,
  hullHp: 100,
  hullMaxHp: 100,
  subsystems: { engine: 100, tractor: 0 },
  mineStock: [],
  tactic: 'fight',
  strategy: null,
});
const arena = { width: 2000, height: 1100, exitPoint: { x: 100, y: 500 } };
const freighter = ship('freighter', 800);
const pirate = ship('pirate', 1300, [
  { weapon: { hullDamage: 80, shieldDamage: 80, cooldownSeconds: 1 } },
]);
assert(escapeViability(freighter, pirate, arena) > 0.5);
assert(estimatedVictoryChance(freighter, pirate) < 0.5, 'unarmed freighter faces unfavorable odds');
const equipped = ship('freight-armed', 800, [
  {
    weapon: {
      family: 'laser',
      mount: 'turret',
      hullDamage: 140,
      shieldDamage: 140,
      cooldownSeconds: 0.5,
      rangeMeters: 1200,
    },
  },
]);
assert(
  estimatedVictoryChance(equipped, pirate) > estimatedVictoryChance(freighter, pirate),
  'ship weapon loadout affects fight odds regardless of civilian role'
);
const obstructed = {
  ...arena,
  obstacles: [{ id: 'rock', position: { x: 500, y: 500 }, radius: 110 }],
};
assert(
  escapeViability(freighter, pirate, obstructed) < escapeViability(freighter, pirate, arena),
  'asteroids along the escape corridor reduce retreat viability'
);
reviewCombatCommitment(freighter, pirate, arena, 0);
assert.equal(freighter.tactic, 'flee', 'weak freighter commits to fleeing if exit is reachable');
freighter.strategy = {
  kind: 'escape',
  focus: 'turret',
  desiredRange: 1000,
  score: 999,
  reason: 'test',
};
reviewCombatCommitment(freighter, pirate, arena, 8);
assert.equal(freighter.tactic, 'flee', 'does not change mind after eight seconds');
const emergency = ship('freighter-emergency', 800);
emergency.tactic = 'flee';
emergency.escapeCommittedAt = 0;
emergency.nextCommitmentReviewAt = 16;
emergency.subsystems.engine = 0;
reviewCombatCommitment(emergency, pirate, arena, 9);
assert.equal(
  emergency.tactic,
  'fight',
  'engine loss interrupts commitment before 16-second boundary'
);
assert.equal(freighter.strategy.kind, 'escape', 'commitment does not trample movement strategy');
freighter.subsystems.engine = 0;
reviewCombatCommitment(freighter, pirate, arena, 16);
assert.equal(
  freighter.tactic,
  'fight',
  'impossible engine-dead escape switches to last-stand combat'
);
assert.equal(freighter.strategy, null, 'transition clears obsolete escape plan');
freighter.subsystems.engine = 100;
reviewCombatCommitment(freighter, pirate, arena, 24);
assert.equal(freighter.tactic, 'fight', 're-entry cooldown prevents fight/flight oscillation');
const commanded = ship('freight-commanded', 800);
commanded.combatTacticLocked = true;
reviewCombatCommitment(commanded, pirate, arena, 0);
assert.equal(commanded.tactic, 'fight', 'explicit player command cannot be replaced');
const trapped = ship('freight-trapped', 800);
const blocker = ship('pirate-blocker', 500, pirate.setup.weapons);
assert(escapeViability(trapped, blocker, arena) < 0.5, 'blocking ship lowers escape odds');
reviewCombatCommitment(trapped, blocker, arena, 0);
assert.equal(
  trapped.tactic,
  'fight',
  'outnumbered but trapped ship fights instead of pointless flight'
);
const runner = ship('freighter', 700);
runner.tactic = 'flee';
const hunter = ship('hunter', 1050);
hunter.velocity.x = -40;
assert.equal(
  usefulEscapeMine(runner, hunter, arena),
  true,
  'mine intercepts rear pursuer on exit line'
);
hunter.position.x = 450;
assert.equal(
  usefulEscapeMine(runner, hunter, arena),
  false,
  'never waste mine on enemy between ship and exit'
);
hunter.position.x = 1050;
hunter.position.y = 800;
assert.equal(usefulEscapeMine(runner, hunter, arena), false, 'no mine on off-axis enemy');
hunter.position.y = 500;
hunter.velocity.x = 130;
assert.equal(usefulEscapeMine(runner, hunter, arena), false, 'no mine on pursuer moving away');
// Reproducible 100-condition matrix: no immediate fight/flee oscillation.
for (let seed = 1; seed <= 100; seed += 1) {
  const fighter = ship('freighter-' + seed, 700 + (seed % 40));
  const threat = ship('pirate-' + seed, 1280, pirate.setup.weapons);
  fighter.setup.shipId = 'freighter';
  fighter.shieldHp = 30 + (seed % 70);
  fighter.hullHp = 40 + (seed % 60);
  fighter.nextStrategyReviewAt = seed % 2 === 0 ? 0 : 4;
  const firstAt = fighter.nextStrategyReviewAt;
  reviewCombatCommitment(fighter, threat, arena, firstAt);
  const initialTactic = fighter.tactic;
  for (let elapsed = firstAt + 1; elapsed < firstAt + 8; elapsed += 1)
    reviewCombatCommitment(fighter, threat, arena, elapsed);
  assert.equal(
    fighter.tactic,
    initialTactic,
    'seed ' + seed + ': combat commitment cannot oscillate between eight-second reviews'
  );
}
console.log(
  'PASS combat confidence, retreat commitment, escape feasibility and rear-guard mine geometry'
);
