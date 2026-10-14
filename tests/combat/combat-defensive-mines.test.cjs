'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const mines = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-mines.ts');
const { getShipMine } = loadStandaloneTypeScriptModule(root, 'src/data/combat/ship-mines.ts');
const hunter = getShipMine('mine-hunter-1');
assert(hunter);
const setup = (id, mineStock) => ({
  id,
  name: id,
  shipId: 'test',
  shieldHp: 0,
  hullHp: 120,
  weapons: [],
  hitChance: 0.8,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  mines: mineStock,
});
const arena = {
  width: 1800,
  height: 1100,
  attackerPosition: { x: 500, y: 500 },
  defenderPosition: { x: 900, y: 500 },
  exitPoint: { x: 100, y: 500 },
};
const fugitive = geometry.createCombatant(setup('escape', [hunter]), 'attacker', arena);
const pursuer = geometry.createCombatant(setup('chase', []), 'defender', arena);
fugitive.tactic = 'flee';
pursuer.velocity.x = -80;
const runtime = { mineSerial: 0, mines: [], lastEvent: '', arena, elapsedSeconds: 0 };
mines.maybeDropRuntimeMine(runtime, 'attacker', fugitive, pursuer, 0.08);
assert.equal(runtime.mines.length, 1, 'escape should deploy a defensive mine against an approaching rear pursuer');
assert.equal(runtime.mines[0].definition.id, hunter.id);
assert.equal(runtime.mines[0].owner, 'attacker');
assert.equal(fugitive.mineStock.length, 0);
assert(fugitive.mineCooldown > 0);
const second = geometry.createCombatant(setup('escape2', [hunter]), 'attacker', arena);
pursuer.subsystems.engine = 0;
second.tactic = 'flee';
mines.maybeDropRuntimeMine(runtime, 'attacker', second, pursuer, 0.08);
assert.equal(runtime.mines.length, 1, 'disabled pursuer should not trigger defensive laying');
console.log('PASS defensive minefield prevents unarmed pursuit while fleeing');
