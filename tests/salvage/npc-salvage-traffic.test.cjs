'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const localSalvage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-salvage-service.ts'
);

function salvager(id, preference) {
  return {
    id,
    name: 'Test Salvager',
    role: 'salvager',
    job: 'salvager',
    shipId: 'salvage-100m-variant-01',
    locationId: 'wreck-field',
    credits: 3000000,
    cargoCapacity: 20,
    normalCargoCapacity: 7,
    cargo: {},
    workResourceIds: ['steel'],
    workLocationId: 'wreck-field',
    fuel: 155,
    fuelCapacity: 155,
    fuelUse: 0.88,
    hullHp: 82,
    hullMaxHp: 82,
    aggression: preference === 'risky' ? 80 : 20,
    workRiskPreference: preference,
    activityId: 'dock',
    activity: 'Wartet',
    successfulRuns: 0,
  };
}

function field() {
  return {
    id: 'wreck-field-test',
    sourceLocationId: 'wreck-field',
    seed: 91,
    width: 1000,
    height: 800,
    wrecks: [
      {
        id: 'wreck-a',
        name: 'Testwrack',
        kind: 'freighter',
        quality: 3,
        position: { x: 500, y: 400 },
        radius: 45,
        rotation: 0,
        integrity: 70,
        resources: [
          { resourceId: 'steel', initialAmount: 80, remainingAmount: 80 },
          { resourceId: 'ship-parts', initialAmount: 40, remainingAmount: 40 },
        ],
        component: null,
        componentStatus: 'none',
        inspected: false,
      },
    ],
  };
}

{
  const npc = salvager('salvager-lifecycle', 'safe');
  const salvageField = field();
  let departed = false;
  const service = localSalvage.createNpcLocalSalvageService({
    locationId: 'wreck-field',
    field: salvageField,
    salvagers: [npc],
    recover: (worker, resourceId, requested) => {
      const used = Object.values(worker.cargo).reduce((sum, value) => sum + value, 0);
      const accepted = Math.min(requested, worker.cargoCapacity - used);
      worker.cargo[resourceId] = (worker.cargo[resourceId] ?? 0) + accepted;
      return accepted;
    },
    depart: () => {
      departed = true;
      return true;
    },
  });

  assert.equal(service.ships.length, 1);
  const first = { ...service.ships[0].position };
  assert(
    first.x <= 18 || first.x >= 982 || first.y <= 18 || first.y >= 782,
    'NPC salvager must enter through the field perimeter'
  );

  let sawApproach = false;
  let sawScan = false;
  let sawSalvage = false;
  let sawExit = false;
  for (let step = 0; step < 12000 && !departed; step += 1) {
    service.tick(0.08);
    const ship = service.ships[0];
    if (!ship) continue;
    if (ship.phase === 'approaching') sawApproach = true;
    if (ship.phase === 'scanning' && ship.scanProgress > 0) sawScan = true;
    if (ship.phase === 'salvaging' && ship.salvageActive) sawSalvage = true;
    if (ship.phase === 'exiting') sawExit = true;
  }

  assert(sawApproach);
  assert(sawScan, 'NPC salvager must scan a wreck before stripping it');
  assert(sawSalvage);
  assert(sawExit);
  assert(departed, 'full NPC salvager must hand back to sector travel after leaving');
  assert.equal(
    Object.values(npc.cargo).reduce((sum, value) => sum + value, 0),
    20,
    'NPC salvager must keep working until cargo is full'
  );
  assert(
    salvageField.wrecks[0].resources.reduce((sum, entry) => sum + entry.remainingAmount, 0) < 120,
    'NPC salvage must deplete the same visible wreck resources'
  );
}

const minerSource = fs.readFileSync(
  path.join(root, 'src/systems/npcs/npc-local-mining-service.ts'),
  'utf8'
);
const salvageSource = fs.readFileSync(
  path.join(root, 'src/systems/npcs/npc-local-salvage-service.ts'),
  'utf8'
);
assert(
  minerSource.includes('createMiningEventController'),
  'NPC miners must use the exact player mining event controller'
);
assert(
  salvageSource.includes('createSalvageEventController'),
  'NPC salvagers must use the exact player salvage event controller'
);
assert(
  minerSource.includes("npc.workRiskPreference === 'risky'") &&
    salvageSource.includes("npc.workRiskPreference === 'risky'"),
  'NPC workers must choose their player event options from a persistent safe-or-risk preference'
);
assert(
  minerSource.includes("kind: 'mining'") && salvageSource.includes("kind: 'salvage'"),
  'NPC event choices and player-equivalent outcomes must be persisted for inspection'
);

console.log('PASS NPC salvagers enter, scan, salvage until full, resolve player events and leave');
