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
const id = (type, base, bonus) => components.createShipyardVariantId(type, base, bonus, 10);

for (const [type, base] of [
  ['reactor', 'reactor1'],
  ['engine', 'engine1'],
  ['shield', 'shield1'],
  ['hull', 'hull1'],
  ['sensor', 'sensor1'],
  ['weapon', 'weapon1'],
  ['cargo', 'cargo1'],
  ['mining', 'mining1'],
  ['salvage', 'salvage1'],
]) {
  const performanceId = id(type, base, 'performance');
  assert(performanceId, type + ' must offer a performance bonus');
  const selected = components.getShipComponent(type, performanceId);
  assert.equal(selected.shipyardVariant, true);
  assert.equal(selected.salvageModifier, 'performance');
  assert.equal(selected.salvageModifierPct, 10);
  assert(selected.cost > 0, 'market offers must have a real purchase price');
  assert.equal(id(type, base, 'efficiency') !== null, selected.power > 0);
}

assert(
  components.getShipComponent('reactor', id('reactor', 'reactor1', 'performance')).output >
    components.getShipComponent('reactor', 'reactor1').output,
  'performance choice must improve reactor output'
);
assert(
  components.getShipComponent('weapon', id('weapon', 'weapon1', 'performance')).weapon.hullDamage >
    components.getShipComponent('weapon', 'weapon1').weapon.hullDamage,
  'performance choice must improve weapon damage'
);
const efficient = components.getShipComponent('weapon', id('weapon', 'weapon1', 'efficiency'));
assert(efficient.power < components.getShipComponent('weapon', 'weapon1').power);
assert.equal(efficient.salvageModifier, 'efficiency');

const researchModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/shipyard-research-service.ts'
);
const research = researchModule.createShipyardResearchService();
assert.equal(research.variants('weapon', 6).length, 0, 'no free bonus offers before research');
assert.equal(research.registerComponent('weapon', 'special_performance_6_weapon1'), true);
assert.equal(
  research.registerComponent('weapon', 'special_performance_3_weapon1'),
  false,
  'lower discovered values must not replace the best one'
);
assert.equal(research.variants('weapon', 6)[0].salvageModifierPct, 6);
assert.equal(research.registerComponent('weapon', 'special_performance_15_weapon1'), true);
assert.equal(research.variants('weapon', 6)[0].salvageModifierPct, 15);
assert.equal(
  research.variants('weapon', 6).filter((item) => item.baseId === 'weapon2').length,
  0,
  'a discovered bonus must not leak to higher Mk tiers'
);
assert.equal(research.registerComponent('weapon', 'special_efficiency_3_weapon1'), true);
assert.equal(research.variants('weapon', 6).length, 2, 'bonus types remain alternative offers');

const port = fs.readFileSync(path.join(root, 'src/app/game-controller-port.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/ui/port/port-secondary-panes.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const startup = fs.readFileSync(path.join(root, 'src/app/game-controller-initial-state.ts'), 'utf8');
const transactions = fs.readFileSync(
  path.join(root, 'src/systems/ships/shipyard-component-transactions.ts'),
  'utf8'
);
assert(port.includes('purchaseShipyardComponent(shipyardTransactions(context)'));
assert(port.includes('sellShipyardComponent(shipyardTransactions(context)'));
assert(transactions.includes('trade.takeCredits(component.cost)'));
assert(transactions.includes('inventory.store('));
assert(transactions.includes('inventory.take(uid)'));
assert(ui.includes('data-yard-catalog'));
assert(ui.includes('data-buy-ship-id'));
assert(
  startup.includes('createShipOwnershipService(options.ship.id, economy.trade)'),
  'initial player state must still create the canonical ship ownership service'
);
assert(
  controller.includes('createInitialControllerState(options, economy)'),
  'game controller must initialize ownership using the extracted state factory'
);

console.log('PASS shipyard sales, one selected component bonus, and owned-ship UI wiring');
