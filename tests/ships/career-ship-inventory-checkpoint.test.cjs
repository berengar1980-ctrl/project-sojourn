'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createShipComponentInventoryService, stageCareerShipComponentInventory } = load(
  'src/systems/ships/ship-component-inventory-service.ts'
);
const player = { cargo: {}, reservedCargoTons: 0 };
const live = createShipComponentInventoryService(player);
const first = live.store('mine', 'mine-ion-1', 'wreck-1', 200, 'salvage');
assert(first);
const saved = live.snapshot();
const reserved = player.reservedCargoTons;
const restored = stageCareerShipComponentInventory(saved, player);
assert.deepEqual(restored.snapshot(), saved);
assert.equal(player.reservedCargoTons, reserved, 'restore must not reserve cargo twice');
assert.notStrictEqual(restored.list()[0], live.list()[0]);
assert(restored.take(first.uid));
assert.equal(player.reservedCargoTons, 0);
assert.equal(live.list().length, 1, 'staging must not mutate live component inventory');
for (const invalid of [
  { ...saved, serial: -1 },
  { ...saved, components: [saved.components[0], saved.components[0]] },
  { ...saved, components: [{ ...first, componentId: 'missing' }] },
  { ...saved, components: [{ ...first, cargoTons: 1 }] },
  { ...saved, components: [{ ...first, uid: 'loose-999-wreck-1' }] },
]) {
  assert.throws(() => stageCareerShipComponentInventory(invalid, player));
}
console.log('PASS career loose component checkpoint: detached restore and no double reservation');
