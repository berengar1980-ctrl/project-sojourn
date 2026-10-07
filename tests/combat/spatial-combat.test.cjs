'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const combatModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);

const laser = {
  id: 'test-laser',
  type: 'weapon',
  name: 'Test Pulse Laser',
  tier: 1,
  power: 1,
  cost: 0,
  weapon: {
    family: 'pulse_laser',
    role: 'balanced',
    shieldDamage: 16,
    hullDamage: 14,
    rangeMeters: 900,
    cooldownSeconds: 0.35,
    heat: 1,
    ammoPerShot: 0,
  },
};

const missile = {
  id: 'test-missile',
  type: 'weapon',
  name: 'Test Missile',
  tier: 1,
  power: 1,
  cost: 0,
  weapon: {
    family: 'guided_missile',
    role: 'balanced',
    shieldDamage: 22,
    hullDamage: 28,
    rangeMeters: 1300,
    cooldownSeconds: 0.8,
    heat: 1,
    ammoPerShot: 1,
  },
};

function setup(id, tactic) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 90,
    hullHp: 100,
    weapons: [laser, missile],
    hitChance: 0.95,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    preferredTactic: tactic,
    combatSpeed: 120,
    mineCharges: 3,
  };
}

const combat = combatModule.createStrategicCombatService(
  setup('player', 'fight'),
  setup('enemy', 'kite'),
  1337,
  {
    width: 2200,
    height: 1400,
    attackerPosition: { x: 500, y: 700 },
    defenderPosition: { x: 1500, y: 700 },
  }
);

const initial = combat.getSnapshot();
assert.equal(initial.arena.width, 2200);
assert.equal(initial.attacker.position.x, 500);
assert.equal(initial.defender.position.x, 1500);

let sawProjectile = false;
let sawImpact = false;
let shieldDropped = false;
for (let step = 0; step < 500 && !combat.getSnapshot().winner; step += 1) {
  const snapshot = combat.tick(0.08);
  if (snapshot.projectiles.length > 0) sawProjectile = true;
  if (snapshot.lastImpact?.layer === 'shield' || snapshot.lastImpact?.layer === 'hull') {
    sawImpact = true;
  }
  if (
    snapshot.attacker.shieldHp < snapshot.attacker.shieldMaxHp ||
    snapshot.defender.shieldHp < snapshot.defender.shieldMaxHp
  ) {
    shieldDropped = true;
  }
}

const afterFire = combat.getSnapshot();
assert(
  afterFire.attacker.position.x !== initial.attacker.position.x ||
    afterFire.attacker.position.y !== initial.attacker.position.y,
  'combatants must move in tactical space'
);
assert(sawProjectile, 'weapons must create visible projectiles');
assert(sawImpact, 'weapon hits must create impact events');
assert(shieldDropped, 'combat fire must collapse shield HP before hull HP');

const mineCombat = combatModule.createStrategicCombatService(
  setup('miner-player', 'minefield'),
  setup('mine-target', 'fight'),
  7,
  {
    width: 1600,
    height: 1000,
    attackerPosition: { x: 650, y: 500 },
    defenderPosition: { x: 950, y: 500 },
  }
);

let sawMine = false;
for (let step = 0; step < 120; step += 1) {
  const snapshot = mineCombat.tick(0.08);
  if (snapshot.mines.length > 0) {
    sawMine = true;
    break;
  }
}
assert(sawMine, 'minefield tactic must lay physical mines in the battle space');

mineCombat.setTactic('attacker', 'flee');
assert.equal(mineCombat.getSnapshot().attacker.tactic, 'flee');

console.log('PASS spatial movement, cooldown fire, shield impacts, mines and tactics');
