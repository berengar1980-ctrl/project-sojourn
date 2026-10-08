'use strict';

const assert = require('node:assert/strict');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const capability = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-salvage-capability.ts'
);
const runtime = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-runtime.ts');
const generator = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-field-generator.ts'
);
const salvage = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-field-service.ts'
);
const economy = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/salvage-economy-service.ts'
);

function createShip(role = 'salvage') {
  return {
    id: role + '-foundation-test',
    name: role + ' foundation',
    role,
    nominalLengthMeters: 100,
    cargoCapacityTons: 260,
    sprite: {
      assetUrl: '',
      widthPx: 400,
      heightPx: 220,
      facing: 'right',
      hardpoints: {
        sourceWidth: 400,
        sourceHeight: 220,
        pivot: { x: 200, y: 110 },
        engines: [],
        miningLasers: [],
        maneuverThrusters: [],
        shield: {
          centerX: 200,
          centerY: 110,
          radiusX: 215,
          radiusY: 125,
          maxHp: 100,
          modifier: 1,
        },
      },
    },
    navigation: { cruiseSpeed: 205 },
  };
}

const salvager = createShip();
const baseline = capability.resolveShipSalvageSetup(salvager);
assert.equal(baseline.available, true);
assert.equal(baseline.yieldMultiplier, 1);
assert.equal(baseline.chanceBonus, 0);
assert.equal(baseline.cargoCapacityTons, 260);
assert.equal(capability.resolveShipSalvageSetup(createShip('freighter')).available, false);

const upgraded = capability.resolveShipSalvageSetup(salvager, {
  reactor: ['reactor2'],
  engine: ['engine1'],
  shield: ['shield1'],
  sensor: ['sensor1'],
  salvage: ['salvage2'],
  cargo: ['cargo2'],
});
assert(upgraded.yieldMultiplier > baseline.yieldMultiplier);
assert(upgraded.chanceBonus > baseline.chanceBonus);
assert(upgraded.cycleSeconds < baseline.cycleSeconds);
assert.equal(upgraded.cargoCapacityTons, 305);

const underpowered = capability.resolveShipSalvageSetup(salvager, {
  reactor: ['reactor1'],
  engine: ['engine3'],
  sensor: ['sensor3'],
  mining: ['mining1'],
  salvage: ['salvage3'],
});
assert.equal(underpowered.available, false);

const runtimeSetup = runtime.resolveShipRuntimeSetup(salvager);
assert.equal(runtimeSetup.salvage.available, true);
assert.equal(runtimeSetup.salvageCrewSkill, 12);

const firstField = generator.generateSalvageField('drift-wreck', 77, 2);
const secondField = generator.generateSalvageField('drift-wreck', 77, 2);
assert.deepEqual(firstField, secondField, 'wreck fields must be deterministic for a visit seed');
assert(firstField.wrecks.length >= 5);
assert(firstField.wrecks.every((wreck) => wreck.resources.length > 0));
assert(
  firstField.wrecks.every((wreck) => wreck.component === null && wreck.componentStatus === 'none'),
  'ordinary salvage fields must not contain recoverable ship components'
);

const player = { credits: 0, cargo: {} };
let pool = 100;
const salvageEconomy = economy.createSalvageEconomyService(
  {
    allocatePhysicalResource(_resourceId, amount) {
      const moved = Math.min(pool, amount);
      pool -= moved;
      return moved;
    },
  },
  {
    player,
    receiveCargo(resourceId, amount, capacity, originId) {
      const used = Object.values(player.cargo).reduce((sum, lot) => sum + lot.qty, 0);
      const moved = Math.min(amount, Math.max(0, capacity - used));
      if (moved <= 0) return 0;
      const lot = player.cargo[resourceId] ?? { qty: 0, totalCost: 0 };
      player.cargo[resourceId] = {
        qty: lot.qty + moved,
        totalCost: lot.totalCost,
        lastOriginId: originId,
      };
      return moved;
    },
  }
);

const field = generator.generateSalvageField('sargasso-graveyard', 17, 2);
const wreck = field.wrecks[0];
const service = salvage.createSalvageFieldService({
  field,
  setup: baseline,
  crewSkill: 80,
  collect: salvageEconomy.recover,
});
assert.equal(service.recoverResource(wreck.id), null, 'wreck must be inspected before stripping');
assert.equal(service.inspectWreck(wreck.id).inspected, true);
const before = wreck.resources.reduce((sum, deposit) => sum + deposit.remainingAmount, 0);
const recovered = service.recoverResource(wreck.id);
assert(recovered && recovered.recovered > 0);
const after = wreck.resources.reduce((sum, deposit) => sum + deposit.remainingAmount, 0);
assert.equal(before - after, recovered.recovered);
assert(Object.keys(player.cargo).length > 0);
assert.equal(pool, 100 - recovered.recovered, 'salvage must draw from the physical resource pool');

const fs = require('node:fs');
const salvageRenderer = fs.readFileSync(
  path.join(root, 'src/ui/salvage/salvage-space-renderer.ts'),
  'utf8'
);
assert(
  salvageRenderer.includes('drawPlayerSalvageEffect') &&
    salvageRenderer.includes("this.model.phase !== 'stripping'") &&
    salvageRenderer.includes("'extracting-component'") &&
    salvageRenderer.includes('tractorBeams') &&
    salvageRenderer.includes('lineDashOffset'),
  'active player salvage must have a visible tether and material-transfer effect'
);

console.log('PASS salvage capability, deterministic wrecks, crew yield and economy recovery');
