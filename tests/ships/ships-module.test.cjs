'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const registry = fs.readFileSync(path.join(root, 'src/systems/ships/ship-registry.ts'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src/app/bootstrap.ts'), 'utf8');
const controller = readModuleSource(root, 'src/app/game-controller.ts');

const roles = [
  { key: 'patrol', folder: 'patrol', length: 60, width: 260, role: 'patrol' },
  { key: 'miner', folder: 'mining', length: 80, width: 346, role: 'mining' },
  { key: 'salvage', folder: 'salvage', length: 100, width: 432, role: 'salvage' },
  { key: 'freighter', folder: 'freighter', length: 120, width: 518, role: 'freighter' },
];
const heights = {
  patrol: [171, 174, 180, 164, 173, 165, 171],
  miner: [215, 213, 213, 236, 201, 231, 223],
  salvage: [298, 290, 295, 302, 282, 278, 299],
  freighter: [324, 331, 322, 330, 337, 315, 324],
};

assert(registry.includes('patrolVariantShips'), 'registry must expose patrol variants');
assert(registry.includes('minerVariantShips'), 'registry must expose miner variants');
assert(registry.includes('salvageVariantShips'), 'registry must expose salvage variants');
assert(registry.includes('freighterVariantShips'), 'registry must expose freighter variants');
assert(
  bootstrap.includes("getShipDefinition('miner-80m-variant-01')"),
  'the first sprite-sheet miner must be the default test ship'
);
assert(
  controller.includes('getAllShipDefinitions()'),
  'test ship switcher must receive the full ship registry'
);
assert(
  controller.includes('navigation.setCruiseSpeed(nextShip.navigation.cruiseSpeed)'),
  'ship switching must apply the selected navigation stats'
);

let count = 0;
for (const spec of roles) {
  const source = fs.readFileSync(
    path.join(root, 'src/data/ships', spec.key + '-variant-ships.ts'),
    'utf8'
  );
  for (let index = 0; index < 7; index += 1) {
    const suffix = String(index + 1).padStart(2, '0');
    const base = spec.key + '-' + spec.length + 'm-variant-' + suffix;
    const asset = path.join(root, 'resources/ships', spec.folder, base + '.png');
    const hardpointFile = path.join(root, 'src/data/ships', base + '.hardpoints.json');
    assert(fs.existsSync(asset), base + ' sprite must exist');
    assert(fs.existsSync(hardpointFile), base + ' hardpoint JSON must exist');
    assert(source.includes("id: '" + base + "'"), base + ' must be registered');

    const hardpoints = JSON.parse(fs.readFileSync(hardpointFile, 'utf8'));
    assert.equal(hardpoints.sourceWidth, spec.width, base + ' canvas width mismatch');
    assert.equal(
      hardpoints.sourceHeight,
      heights[spec.key][index],
      base + ' canvas height mismatch'
    );
    assert(hardpoints.engines.length >= 2, base + ' needs engine hardpoints');
    assert.equal(
      hardpoints.maneuverThrusters.length,
      6,
      base + ' needs six RCS hardpoints including reverse thrust'
    );
    assert.equal(hardpoints.shield.maxHp, 100, base + ' starter shield must have 100 HP');
    if (spec.key === 'miner') {
      assert.equal(
        hardpoints.miningLasers.length,
        [3, 4, 2, 3, 4, 3, 3][index],
        base + ' must retain its variant-specific mining emitters'
      );
    } else {
      assert.equal(hardpoints.miningLasers.length, 0, base + ' must not expose mining lasers');
    }
    count += 1;
  }
}

assert.equal(count, 28, 'test fleet must contain exactly 28 new selectable variants');
console.log('PASS sprite-sheet fleet registry, assets and hardpoint contracts');
