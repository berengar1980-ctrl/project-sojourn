'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { transferCapturedCargo } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-combat-rewards.ts'
);
const npc = { cargo: { ferrite: 7, steel: 3 } };
const playerCargo = {};
let remaining = 5;
const receive = (id, requested) => {
  const qty = Math.min(requested, remaining);
  remaining -= qty;
  playerCargo[id] = (playerCargo[id] ?? 0) + qty;
  return qty;
};
const acquired = transferCapturedCargo(npc, receive);
assert.deepEqual(acquired, [{ resourceId: 'ferrite', quantity: 5 }]);
assert.equal(npc.cargo.ferrite, 2);
assert.equal(npc.cargo.steel, 3, 'cargo capacity prevents excessive rewards');
assert.equal(playerCargo.ferrite, 5);
assert.deepEqual(transferCapturedCargo(npc, receive), [], 'full hold cannot clone cargo');
remaining = 4;
assert.deepEqual(transferCapturedCargo(npc, receive),
  [{ resourceId: 'ferrite', quantity: 2 }, { resourceId: 'steel', quantity: 2 }]);
assert.equal(npc.cargo.ferrite, undefined);
assert.equal(npc.cargo.steel, 1);
const fs = require('node:fs');
const source = fs.readFileSync(path.join(root, 'src/app/game-controller-combat-rewards.ts'), 'utf8');
assert(source.includes("snapshot.winner !== 'attacker'"), 'only a player victory qualifies for loot');
assert(source.includes("!capturedByBoarding && snapshot.defender.hullHp > 0"), 'living enemy cargo requires boarding');
console.log('PASS campaign combat loot transfers real NPC cargo without capacity overflow or duplication');
