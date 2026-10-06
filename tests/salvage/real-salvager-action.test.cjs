'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const registry = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const loadoutModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-loadout-service.ts'
);
const runtimeModule = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-runtime.ts');
const generator = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-field-generator.ts'
);
const localModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-local-space-service.ts'
);
const npcModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-salvage-service.ts'
);

const ship = registry.getShipsByRole('salvage')[0];
assert(ship, 'a real registered salvager must exist');

const loadouts = loadoutModule.createShipLoadoutService();
const installed = loadouts.get(ship);
assert.equal(
  installed.salvage?.[0],
  'salvage1',
  'switching to a registered salvager must create a Mk-I salvage loadout'
);

const runtime = runtimeModule.resolveShipRuntimeSetup(ship, { installed });
assert.equal(
  runtime.salvage.available,
  true,
  'the real salvager Mk-I loadout must be operational, not merely present in JSON'
);

const field = generator.generateSalvageField('drift-wreck', 20261006, 2);
const wreck = field.wrecks[0];
assert(wreck);

let recovered = 0;
const service = localModule.createSalvageLocalSpaceService({
  field,
  setup: runtime.salvage,
  crewSkill: runtime.salvageCrewSkill,
  collect(_resourceId, amount) {
    recovered += amount;
    return amount;
  },
  approachSpeed: 85,
});

const collisionLoop = npcModule.createNpcLocalSalvageService({
  locationId: 'drift-wreck',
  field,
  salvagers: [],
  recover() {
    return 0;
  },
  depart() {
    return false;
  },
  playerShip: ship,
  getPlayerShipState: () => service.getSnapshot().ship,
});

service.selectWreck(wreck.id);
service.startInspect(wreck.id);
for (let index = 0; index < 1200 && !wreck.inspected; index += 1) {
  service.tick(0.05);
  collisionLoop.tick(0.05);
}
assert.equal(
  wreck.inspected,
  true,
  'real salvager must reach a wreck and finish scanning even with wreck shield collisions active'
);

let snapshot = service.getSnapshot();
if (snapshot.salvageEvent) {
  const safe = snapshot.salvageEvent.choices.find((choice) => choice.risk === 'safe');
  assert(safe);
  service.resolveSalvageEvent(safe.id);
  for (
    let index = 0;
    index < 400 && service.getSnapshot().salvageEventRecoverySeconds > 0;
    index += 1
  ) {
    service.tick(0.05);
    collisionLoop.tick(0.05);
  }
}

const deposit = wreck.resources.find((entry) => entry.remainingAmount > 0);
assert(deposit, 'inspected wreck must expose recoverable material');
service.startStrip(wreck.id, deposit.resourceId);
snapshot = service.getSnapshot();
assert.notEqual(
  snapshot.phase,
  'idle',
  'pressing salvage on a valid resource must immediately start approach or stripping'
);

for (let index = 0; index < 1600 && recovered <= 0; index += 1) {
  service.tick(0.05);
  collisionLoop.tick(0.05);
}
assert(
  recovered > 0,
  'real registered salvager must physically recover cargo through the same collision loop used in game'
);

console.log('PASS real salvager switch loadout, scan, approach and cargo recovery');
