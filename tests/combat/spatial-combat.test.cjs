'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const combatModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const mineCatalog = loadStandaloneTypeScriptModule(root, 'src/data/combat/ship-mines.ts');

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
    combatSpeed: 105,
    turnRateRadiansPerSecond: 0.65,
    accelerationMetersPerSecond2: 28,
    mines: [
      mineCatalog.getShipMine('mine-ion-1'),
      mineCatalog.getShipMine('mine-shaped-charge-1'),
      mineCatalog.getShipMine('mine-hunter-1'),
    ].filter(Boolean),
    sensorCrewSkill: 80,
    sensorTier: 2,
    sensorRangeMeters: 1000,
    sensorRangeMultiplier: 1.15,
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
    obstacles: [{ id: 'rock', position: { x: 1000, y: 700 }, radius: 140 }],
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
assert(
  Math.hypot(afterFire.attacker.position.x - 1000, afterFire.attacker.position.y - 700) >= 160,
  'combat movement must not pass through local obstacles'
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

const laserOnly = (id) => ({
  ...setup(id, 'fight'),
  weapons: [laser],
  mines: [],
  hitChance: 1,
  dodgeChance: 0,
  combatSpeed: 80,
});

const blockedCombat = combatModule.createStrategicCombatService(
  laserOnly('blocked-attacker'),
  laserOnly('blocked-defender'),
  19,
  {
    width: 1800,
    height: 1000,
    attackerPosition: { x: 400, y: 500 },
    defenderPosition: { x: 1400, y: 500 },
    obstacles: [{ id: 'wreck', position: { x: 900, y: 500 }, radius: 190 }],
  }
);
for (let step = 0; step < 14; step += 1) blockedCombat.tick(0.08);
assert.equal(
  blockedCombat.getSnapshot().defender.shieldHp,
  blockedCombat.getSnapshot().defender.shieldMaxHp,
  'wrecks and asteroids must block direct laser fire'
);
assert(
  blockedCombat.getSnapshot().lastEvent.includes('Hindernis'),
  'blocked beam should report the obstacle hit'
);

const shieldSideCombat = combatModule.createStrategicCombatService(
  laserOnly('left-attacker'),
  laserOnly('right-defender'),
  23,
  {
    width: 1800,
    height: 1000,
    attackerPosition: { x: 520, y: 500 },
    defenderPosition: { x: 1180, y: 500 },
  }
);
for (let step = 0; step < 20 && shieldSideCombat.getSnapshot().defender.shieldImpacts.length === 0; step += 1) {
  shieldSideCombat.tick(0.08);
}
const shieldSnapshot = shieldSideCombat.getSnapshot();
const shieldImpact = shieldSnapshot.defender.shieldImpacts[0];
assert(shieldImpact, 'laser hit must create the shared shield impact effect');
const worldAnchor = {
  x:
    shieldImpact.surfaceAnchor.x * Math.cos(shieldSnapshot.defender.headingRadians) -
    shieldImpact.surfaceAnchor.y * Math.sin(shieldSnapshot.defender.headingRadians),
  y:
    shieldImpact.surfaceAnchor.x * Math.sin(shieldSnapshot.defender.headingRadians) +
    shieldImpact.surfaceAnchor.y * Math.cos(shieldSnapshot.defender.headingRadians),
};
const towardSource = {
  x: shieldSnapshot.attacker.position.x - shieldSnapshot.defender.position.x,
  y: shieldSnapshot.attacker.position.y - shieldSnapshot.defender.position.y,
};
const sourceLength = Math.hypot(towardSource.x, towardSource.y);
const dot =
  worldAnchor.x * (towardSource.x / sourceLength) +
  worldAnchor.y * (towardSource.y / sourceLength);
assert(dot > 0.65, 'shield impact must appear on the incoming-fire side, not opposite');

const durationCombat = combatModule.createStrategicCombatService(
  setup('duration-a', 'fight'),
  setup('duration-b', 'fight'),
  31,
  {
    width: 1800,
    height: 1000,
    attackerPosition: { x: 500, y: 500 },
    defenderPosition: { x: 1300, y: 500 },
  }
);
for (let step = 0; step < 38; step += 1) durationCombat.tick(0.08);
assert.equal(durationCombat.getSnapshot().winner, null, 'combat must not end after only 2-3 seconds');
for (let step = 0; step < 950 && !durationCombat.getSnapshot().winner; step += 1) {
  durationCombat.tick(0.08);
}
assert(durationCombat.getSnapshot().winner, 'combat should still resolve without manual intervention');
assert(
  durationCombat.getSnapshot().elapsedSeconds >= 25,
  'normal combat should be long enough to observe tactics and effects'
);

mineCombat.setTactic('attacker', 'flee');
assert.equal(mineCombat.getSnapshot().attacker.tactic, 'flee');

console.log('PASS spatial movement, cooldown fire, shield impacts, mines and tactics');
