'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const pilot = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-boost.ts');
const booster = {
  subsystems: { engine: 80 },
  boostSeconds: 3.5,
  boostActive: false,
};
assert.equal(pilot.activateCombatBoost(booster), true, 'charged engine can activate boost');
pilot.updateCombatBoost(booster, 0.5);
assert(booster.boostActive, 'boost remains active while commanded');
assert(booster.boostSeconds < 3.5, 'boost consumes energy');
pilot.stopCombatBoost(booster);
pilot.updateCombatBoost(booster, 0.5);
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
  defender: collisionShip(580, Math.PI, -30),
  elapsedSeconds: 12,
  combatLog: [],
};
assert(applyCombatRamImpact(impactRuntime) > 0, 'closing velocity causes ram damage');
assert(impactRuntime.attacker.shieldHp < 100);
assert(impactRuntime.defender.shieldHp < 100);
const afterImpact = impactRuntime.attacker.shieldHp;
assert.equal(
  applyCombatRamImpact(impactRuntime),
  0,
  'ram cooldown prevents repeated contact damage'
);
assert.equal(impactRuntime.attacker.shieldHp, afterImpact);
console.log('PASS ram selection, ramming trajectory, boost activation and recharge');
