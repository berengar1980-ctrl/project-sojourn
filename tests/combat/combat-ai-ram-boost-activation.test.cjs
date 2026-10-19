'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { chooseCombatFlightIntent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-flight-intent.ts'
);
const { activateCombatBoost, stopCombatBoost, updateCombatBoost } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-boost-control.ts'
);
const { updateStandardCombatBoost } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-standard-boost.ts'
);
const { usefulRamAttempt } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ram-opportunity.ts'
);
const actor = (x) => ({
  position: { x, y: 500 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  tactic: 'fight',
  mineStock: [],
  setup: { combatSpeed: 120 },
  subsystems: { engine: 100 },
});
const initiator = actor(350);
const target = actor(700);
const arena = { width: 2400, height: 1400 };
const normal = chooseCombatFlightIntent(initiator, target, 500, arena, 0.08, false);
const ram = chooseCombatFlightIntent(initiator, target, 500, arena, 0.08, true);
assert.notEqual(normal.kind, 'ram', 'ordinary tactic must not manufacture a ram');
assert.equal(ram.kind, 'ram', 'a real ramming opportunity may change independent intention');
assert(ram.direction.x > 0, 'ram begins on a flank approach toward the opponent');
assert(ram.destination && ram.destination.y > target.position.y, 'ram first stages on the side');
initiator.position = { x: 700, y: 660 };
const finalRun = chooseCombatFlightIntent(initiator, target, 500, arena, 0.08, true);
assert.equal(initiator.ramApproach.phase, 'impact', 'ram commits after reaching the flank');
assert(finalRun.direction.y < 0, 'final approach now drives directly into the enemy side');
initiator.position = { x: 700, y: 580 };
const committed = chooseCombatFlightIntent(initiator, target, 500, arena, 0.08, true);
assert.equal(
  initiator.ramApproach.phase,
  'impact',
  'final impact approach cannot oscillate back out'
);
assert(committed.direction.y < 0, 'approach stays committed through contact');
const ramOpportunityShip = (armor) => ({
  setup: { aiControlled: true, armor },
  tactic: 'fight',
  position: { x: 250, y: 500 },
  hullHp: 180,
  hullMaxHp: 200,
  shieldHp: 90,
  shieldMaxHp: 100,
  subsystems: { engine: 100 },
});
const potentialVictim = {
  position: { x: 800, y: 500 },
  hullHp: 160,
  shieldHp: 50,
  shieldMaxHp: 100,
};
assert.equal(usefulRamAttempt(ramOpportunityShip(undefined), potentialVictim), false);
assert.equal(usefulRamAttempt(ramOpportunityShip({ front: 0.15 }), potentialVictim), true);
const campaignPlayer = ramOpportunityShip({ front: 0.15 });
delete campaignPlayer.setup.aiControlled;
assert.equal(usefulRamAttempt(campaignPlayer, potentialVictim), true);
const surrounded = ramOpportunityShip({ front: 0.125 });
assert.equal(usefulRamAttempt(surrounded, potentialVictim), true);
const finalCharge = {
  ...ramOpportunityShip({ front: 0.15 }),
  position: { x: 750, y: 500 },
  ramApproach: { side: 1, phase: 'impact' },
};
assert.equal(usefulRamAttempt(finalCharge, potentialVictim), true);
delete finalCharge.ramApproach;
assert.equal(usefulRamAttempt(finalCharge, potentialVictim), false);
const fleeingBowShip = { ...ramOpportunityShip({ front: 0.5 }), tactic: 'flee' };
assert.equal(usefulRamAttempt(fleeingBowShip, potentialVictim), false);
const damagedBowShip = { ...ramOpportunityShip({ front: 0.5 }), hullHp: 90 };
assert.equal(usefulRamAttempt(damagedBowShip, potentialVictim), false);
const booster = {
  subsystems: { engine: 80 },
  boostSeconds: 3.5,
  boostActive: false,
  headingRadians: 0,
  tactic: 'fight',
  ramApproach: { side: 1, phase: 'flank' },
};
updateStandardCombatBoost(booster, { x: 1, y: 0 }, 350, 500, 1, true, true, 0.1);
assert.equal(booster.boostActive, false, 'flank staging saves boost for final approach');
booster.ramApproach.phase = 'impact';
updateStandardCombatBoost(booster, { x: 1, y: 0 }, 350, 500, 1, true, true, 0.1);
assert.equal(booster.boostActive, true, 'ram uses boost when committed to side impact');
stopCombatBoost(booster);
assert.equal(activateCombatBoost(booster), true, 'charged engine can activate boost');
updateCombatBoost(booster, 0.5);
assert(booster.boostActive, 'boost remains active while commanded');
assert(booster.boostSeconds < 3.5, 'boost consumes energy');
stopCombatBoost(booster);
updateCombatBoost(booster, 0.5);
assert.equal(booster.boostActive, false, 'stopped boost starts recharging');
assert(booster.boostSeconds > 3, 'boost recharges between bursts');
const npcSetup = loadStandaloneTypeScriptModule(root, 'src/systems/combat/npc-combatant-setup.ts');
const npc = (job, aggression, pirate = false) => ({
  job,
  aggression,
  pirate,
  hullHp: 100,
  hullMaxHp: 100,
});
assert.equal(npcSetup.npcCombatDoctrine(npc('freighter', 30), false), 'flee');
assert.equal(npcSetup.npcCombatDoctrine(npc('miner', 60), true), 'minefield');
assert.equal(npcSetup.npcCombatDoctrine(npc('patrol', 85), false), 'kite');
assert.equal(npcSetup.npcCombatDoctrine(npc('pirate', 90, true), false), 'fight');
assert.equal(npcSetup.npcCombatDoctrine(npc('pirate', 90, true), true), 'minefield');
const { applyCombatRamImpact } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ram-impact.ts'
);
const collisionShip = (x, headingRadians, vx) => ({
  position: { x, y: 500 },
  velocity: { x: vx, y: 0 },
  headingRadians,
  shieldHp: 100,
  hullHp: 200,
  subsystems: { engine: 200 },
});
const impactRuntime = {
  attacker: collisionShip(500, 0, 180),
  defender: collisionShip(545, Math.PI, -30),
  elapsedSeconds: 12,
  combatLog: [],
};
impactRuntime.attacker.ramApproach = { side: 1, phase: 'impact' };
assert(applyCombatRamImpact(impactRuntime) > 0, 'closing velocity causes ram damage');
assert.equal(impactRuntime.attacker.ramApproach, undefined, 'collision completes ram commitment');
assert(impactRuntime.attacker.shieldHp < 100);
assert(impactRuntime.defender.shieldHp < 100);
const afterImpact = impactRuntime.attacker.shieldHp;
assert.equal(
  applyCombatRamImpact(impactRuntime),
  0,
  'ram cooldown prevents repeated contact damage'
);
assert.equal(impactRuntime.attacker.shieldHp, afterImpact);
console.log('PASS autonomous ram intention, canonical boost and physical impact');
