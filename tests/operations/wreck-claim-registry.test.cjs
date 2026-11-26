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
const combatWreck = { ...wreck, id: 'combat-wreck-test', combatWreckVariant: 'split-hull' };
for (const owner of ['player', 'npc-1']) {
  assert.deepEqual(registry.register(field, combatWreck, owner, 2, 1000), {
    ok: false,
    reason: 'combat-wreck',
  });
}
assert.deepEqual(registry.exportState().claims, []);
const legacy = new WreckClaimRegistry();
legacy.restoreState({
  ...registry.exportState(),
  claims: [
    {
      fieldId: field.id,
      wreckId: combatWreck.id,
      ownerId: 'npc-1',
      registeredDay: 2,
      expiresDay: 16,
    },
  ],
});
assert.equal(legacy.claim(field.id, combatWreck.id, 3), null);
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

// Refreshing wreck stock must preserve isolated worker and security snapshots.
const isolated = new WreckClaimRegistry();
const worker = { npcId: 'npc-1', position: { x: 5, y: 6 } };
const drone = { position: { x: 7, y: 8 } };
const escorts = { seed: field.seed, ships: [{ npcId: 'escort', position: { x: 9, y: 10 } }] };
isolated.rememberField(field, drone);
isolated.rememberWorkers(field, [worker]);
isolated.rememberSecurityEscorts(field.sourceLocationId, escorts);
worker.position.x = 50;
drone.position.x = 70;
escorts.ships[0].position.x = 90;
isolated.rememberField(field);
assert.equal(isolated.workerCheckpoint(field)[0].position.x, 5);
assert.equal(isolated.droneCheckpoint(field.sourceLocationId).position.x, 7);
assert.equal(isolated.securityEscortCheckpoint(field.sourceLocationId).ships[0].position.x, 9);
const exported = isolated.exportState().fields[0][1];
exported.workers[0].position.x = 500;
exported.drone.position.x = 700;
exported.securityEscorts.ships[0].position.x = 900;
isolated.rememberField(field);
assert.equal(isolated.workerCheckpoint(field)[0].position.x, 5);
assert.equal(isolated.droneCheckpoint(field.sourceLocationId).position.x, 7);
assert.equal(isolated.securityEscortCheckpoint(field.sourceLocationId).ships[0].position.x, 9);
isolated.rememberField({ ...field, seed: field.seed + 1 });
assert.deepEqual(isolated.workerCheckpoint({ ...field, seed: field.seed + 1 }), []);
assert.equal(isolated.droneCheckpoint(field.sourceLocationId), null);
assert.equal(isolated.securityEscortCheckpoint(field.sourceLocationId), null);

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
