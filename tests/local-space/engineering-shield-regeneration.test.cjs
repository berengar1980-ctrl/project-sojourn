'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const registry = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const systemsModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-ship-systems.ts'
);

const ship = registry.getShipsByRole('mining')[0];
assert(ship);

const systems = systemsModule.createLocalSpaceShipSystems(
  {
    shieldMaxHp: 100,
    shieldModifier: 1,
    hullMaxHp: 100,
    scanAvailable: true,
    sensorModifier: 1,
    sensorCrewSkill: 20,
    reactorOutput: 40,
    reactorContinuousUsed: 20,
    shieldRegenMultiplier: 1.25,
  },
  ship.sprite.hardpoints
);

systems.applyCollision({
  asteroidId: 'regen-test',
  point: { x: 0, y: 0 },
  normal: { x: 1, y: 0 },
  surfaceAnchor: { x: 1, y: 0 },
  mass: 10,
  impactSpeed: 1,
  kineticEnergy: 2500,
});

const damaged = systems.snapshot().shield.currentHp;
assert(damaged < 100 && damaged > 0);

systems.advance(3);
assert.equal(
  systems.snapshot().shield.currentHp,
  damaged,
  'shield must not regenerate during the three-second post-hit lock'
);

systems.advance(2);
const expectedAfterTwoSeconds = Math.min(100, damaged + 0.4 * 1.25 * 2);
assert(
  Math.abs(systems.snapshot().shield.currentHp - expectedAfterTwoSeconds) < 1e-9,
  'engineering must multiply the exact Voidbound 0.4 HP/s shield regeneration'
);

const collapsed = systemsModule.createLocalSpaceShipSystems(
  {
    shieldMaxHp: 100,
    shieldModifier: 1,
    hullMaxHp: 100,
    scanAvailable: true,
    sensorModifier: 1,
    sensorCrewSkill: 20,
    reactorOutput: 40,
    reactorContinuousUsed: 20,
    shieldRegenMultiplier: 1,
  },
  ship.sprite.hardpoints
);
collapsed.applyCollision({
  asteroidId: 'collapse-test',
  point: { x: 0, y: 0 },
  normal: { x: 1, y: 0 },
  surfaceAnchor: { x: 1, y: 0 },
  mass: 1000,
  impactSpeed: 50,
  kineticEnergy: 1_250_000,
});
assert.equal(collapsed.snapshot().shield.currentHp, 0);
collapsed.advance(7);
assert.equal(
  collapsed.snapshot().shield.currentHp,
  0,
  'collapsed shields must stay offline for the full seven-second Voidbound delay'
);
collapsed.advance(1);
assert(
  Math.abs(collapsed.snapshot().shield.currentHp - 0.4) < 1e-9,
  'collapsed shields must resume the base Voidbound regeneration after seven seconds'
);

console.log('PASS engineering skill drives Voidbound shield regeneration and recovery locks');
