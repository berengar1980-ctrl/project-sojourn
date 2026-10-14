'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { collectCombatCargo } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-combat-rewards.ts'
);
const ship = { id: 'miner-80m-variant-01' };
const npc = { id: 'enemy', locationId: 'harbor', cargo: { ferrite: 7, steel: 3 } };
const playerCargo = {};
let remaining = 5;
const context = {
  state: { activeShip: ship },
  crew: { runtimeOptions: () => ({}) },
  loadouts: { get: () => ({}) },
  engagements: { activePlayerEnemy: () => npc },
  economy: {
    trade: {
      receiveCargo: (id, requested) => {
        const qty = Math.min(requested, remaining);
        remaining -= qty;
        playerCargo[id] = (playerCargo[id] ?? 0) + qty;
        return qty;
      },
    },
  },
  systemLog: { write: () => {} },
};
const snapshot = {
  winner: 'attacker',
  attacker: { hullHp: 50 },
  defender: { id: 'enemy', hullHp: 0 },
};
assert.deepEqual(collectCombatCargo(context, { ...snapshot, winner: 'defender' }), []);
assert.equal(npc.cargo.ferrite, 7, 'lost battle cannot transfer cargo');
assert.deepEqual(collectCombatCargo(context, { ...snapshot, defender: { id: 'enemy', hullHp: 5 } }), []);
assert.equal(npc.cargo.ferrite, 7, 'surviving enemy cannot be looted without successful boarding');
const acquired = collectCombatCargo(context, snapshot);
assert.deepEqual(acquired, [{ resourceId: 'ferrite', quantity: 5 }]);
assert.equal(npc.cargo.ferrite, 2);
assert.equal(npc.cargo.steel, 3, 'cargo capacity prevents excessive rewards');
assert.equal(playerCargo.ferrite, 5);
assert.deepEqual(collectCombatCargo(context, snapshot), [], 'repeating settlement cannot clone cargo');
remaining = 4;
assert.deepEqual(collectCombatCargo(context, { ...snapshot, defender: { id: 'enemy', hullHp: 5 } }, true),
  [{ resourceId: 'ferrite', quantity: 2 }, { resourceId: 'steel', quantity: 2 }]);
assert.equal(npc.cargo.ferrite, undefined);
assert.equal(npc.cargo.steel, 1);
console.log('PASS campaign combat loot transfers real NPC cargo without capacity overflow or duplication');
