'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { WreckClaimRegistry } = load('src/systems/operations/wreck-claim-registry.ts');
const { operationalRoleAllowed, npcOperationalRoleAllowed } = load(
  'src/systems/operations/ship-operation-permissions.ts'
);

const field = {
  id: 'field-41',
  sourceLocationId: 'belt-41',
  seed: 41,
  wrecks: [
    {
      id: 'wreck-1',
      inspected: true,
      scanLevel: 'analyzed',
      resources: [{ resourceId: 'steel', initialAmount: 20, remainingAmount: 20 }],
      componentStatus: 'available',
    },
  ],
};
const registry = new WreckClaimRegistry();
const wreck = field.wrecks[0];
assert.equal(registry.register(field, wreck, 'player', 2, 100).ok, false);
const result = registry.register(field, wreck, 'player', 2, 1000);
assert.deepEqual(result, { ok: true, fee: 650 });
assert.equal(registry.register(field, wreck, 'npc-1', 2, 1000).ok, false);
assert.equal(registry.claim(field.id, wreck.id, 3).ownerId, 'player');
assert.equal(registry.claim(field.id, wreck.id, 16), null);
assert.equal(registry.register(field, wreck, 'npc-1', 16, 1000).ok, true);
wreck.resources[0].remainingAmount = 7;
wreck.componentStatus = 'recovered';
registry.rememberField(field);
const snapshot = JSON.parse(JSON.stringify(registry.exportState()));
const restored = new WreckClaimRegistry();
restored.restoreState(snapshot);
assert.equal(restored.seedFor('belt-41', 99), 41);
assert.equal(restored.claim(field.id, wreck.id, 17).ownerId, 'npc-1');
const regenerated = {
  ...field,
  wrecks: [
    {
      ...wreck,
      resources: [{ resourceId: 'steel', initialAmount: 20, remainingAmount: 20 }],
      componentStatus: 'available',
      inspected: false,
      scanLevel: 'unscanned',
    },
  ],
};
restored.restoreField(regenerated);
assert.equal(regenerated.wrecks[0].resources[0].remainingAmount, 7);
assert.equal(regenerated.wrecks[0].componentStatus, 'recovered');
assert.equal(regenerated.wrecks[0].scanLevel, 'analyzed');
assert.equal(registry.abandon(field.id, wreck.id, 'player'), false);
assert.equal(registry.abandon(field.id, wreck.id, 'npc-1'), true);

for (const role of ['mining', 'freighter', 'salvage', 'patrol']) {
  assert.equal(operationalRoleAllowed(role, 'salvage'), role === 'salvage');
  assert.equal(operationalRoleAllowed(role, 'mining'), role === 'mining');
  assert.equal(operationalRoleAllowed(role, 'blockade'), role === 'freighter');
  assert.equal(operationalRoleAllowed(role, 'patrol'), role === 'patrol');
}
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const salvageShip = getAllShipDefinitions().find((ship) => ship.role === 'salvage');
const freighter = getAllShipDefinitions().find((ship) => ship.role === 'freighter');
assert(salvageShip && freighter);
assert(npcOperationalRoleAllowed({ job: 'salvager', shipId: salvageShip.id }, 'salvage'));
assert(!npcOperationalRoleAllowed({ job: 'salvager', shipId: freighter.id }, 'salvage'));
assert(!npcOperationalRoleAllowed({ job: 'miner', shipId: salvageShip.id }, 'mining'));

console.log('PASS wreck claim exclusivity, expiry, save/restore and hull permissions');
