'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const components = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const catalog = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const mines = catalog.SHIP_COMPONENT_CATALOG.mine;
assert.equal(mines.length, 18, 'three mine families must have all six Mk tiers');
for (const mine of mines) {
  assert.equal(mine.type, 'mine');
  assert.equal(mine.mine.tier, mine.tier);
  assert(mine.cost > 0);
  assert.equal(components.getShipComponent('mine', mine.id)?.id, mine.id);
}
const improved = components.getShipComponent('mine', 'special_performance_15_mine-ion-1');
assert(improved.mine.shieldDamage > mines[0].mine.shieldDamage);

const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const player = source('src/app/game-controller-combat.ts');
const npc = source('src/systems/combat/npc-combatant-setup.ts');
const ship = source('src/systems/ships/ship-mining-capability.ts');
const port = source('src/app/game-controller-port.ts');
const localNpc = source('src/systems/npcs/npc-local-salvage-service.ts');

assert(player.includes('runtime.installed.mine'));
assert(npc.includes('installed.mine'));
assert(!player.includes("getShipMine('mine-ion-'"));
assert(!npc.includes("getShipMine('mine-ion-'"));
assert(ship.includes("mine: ['']"), 'ship starts with empty dedicated mine slot');
assert(port.includes("'mine'"), 'mine modules must appear in shipyard catalog');
assert(localNpc.includes('wreck.componentStatus = \'recovered\''));
assert(localNpc.includes('npc.salvageComponents = stored'));
assert(port.includes('if (removed) componentInventory.take(removed.uid)'));
assert(port.includes('if (selected)'), 'failed swaps must restore selected inventory parts');
console.log('PASS mine modules, NPC salvage, and shipyard rollback wiring');
