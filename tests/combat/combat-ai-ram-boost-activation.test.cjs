'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const exchange = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-exchange-machine.ts');
const pilot = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-exchange-pilot.ts');
const context = (ramOpportunity) => ({
  frontWeapons: 0,
  broadsideWeapons: 3,
  guidedWeapons: 0,
  attackerDamage: 0,
  defenderDamage: 0,
  roll: () => 0.5,
  ramOpportunity,
});
const regular = exchange.advanceExchange(exchange.initialExchange('attacker'), 0.1, context(false));
const ramming = exchange.advanceExchange(exchange.initialExchange('attacker'), 0.1, context(true));
assert.equal(regular.action, 'broadside_pass', 'broadside remains preferred without ram opportunity');
assert.equal(ramming.action, 'frontal_pass', 'AI actively chooses ram pass against weak target');
const initiator = { position: { x: 350, y: 500 } };
const target = { position: { x: 700, y: 500 } };
const normal = pilot.planExchangeFlight(initiator, target, 'frontal_pass', 'evade', 'strong', false);
const ram = pilot.planExchangeFlight(initiator, target, 'frontal_pass', 'evade', 'strong', true);
assert(ram.initiatorGoal.x > normal.initiatorGoal.x, 'ram crosses target instead of breaking off early');
const booster = {
  subsystems: { engine: 80 },
  boostSeconds: 3.5,
  boostActive: false,
};
assert.equal(pilot.activateExchangeBoost(booster), true, 'charged engine can activate boost');
pilot.updateExchangeBoost(booster, 0.5);
assert(booster.boostActive, 'boost remains active while commanded');
assert(booster.boostSeconds < 3.5, 'boost consumes energy');
pilot.stopExchangeBoost(booster);
pilot.updateExchangeBoost(booster, 0.5);
assert.equal(booster.boostActive, false, 'stopped boost starts recharging');
assert(booster.boostSeconds > 3, 'boost recharges between bursts');
const npcSetup = loadStandaloneTypeScriptModule(root, 'src/systems/combat/npc-combatant-setup.ts');
const npc = (job, aggression, pirate = false) => ({
  job, aggression, pirate, hullHp: 100, hullMaxHp: 100,
});
assert.equal(npcSetup.npcCombatDoctrine(npc('freighter', 30), false), 'flee');
assert.equal(npcSetup.npcCombatDoctrine(npc('miner', 60), true), 'minefield');
assert.equal(npcSetup.npcCombatDoctrine(npc('patrol', 85), false), 'kite');
assert.equal(npcSetup.npcCombatDoctrine(npc('pirate', 90, true), false), 'fight');
assert.equal(npcSetup.npcCombatDoctrine(npc('pirate', 90, true), true), 'minefield');
console.log('PASS ram selection, ramming trajectory, boost activation and recharge');
