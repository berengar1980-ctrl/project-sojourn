'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const registry = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');
const ships = registry.getAllShipDefinitions();

assert(ships.length > 0, 'expected registered ship variants');
for (const ship of ships) {
  const mounts = ship.sprite.hardpoints;
  assert(mounts.tractorBeams?.length > 0, ship.id + ': tractor mount is missing');
  assert(mounts.grapplingHooks?.length > 0, ship.id + ': grapple mount is missing');
  for (const point of [...mounts.tractorBeams, ...mounts.grapplingHooks]) {
    assert(point.x >= 0 && point.x <= mounts.sourceWidth, ship.id + ': invalid utility x');
    assert(point.y >= 0 && point.y <= mounts.sourceHeight, ship.id + ': invalid utility y');
    assert(['above', 'below'].includes(point.layer), ship.id + ': utility layer missing');
  }
}

console.log('PASS all registered ship variants have valid tractor and grapple mounting points');
