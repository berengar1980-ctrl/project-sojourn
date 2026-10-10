'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { getShipDefinition } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-registry.ts'
);
const { createShipLoadoutService, shipCanFitWeapon } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-loadout-service.ts'
);
const { getShipComponent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const { weaponInArc } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-geometry.ts'
);
const original = getShipDefinition('patrol-60m-variant-01');
assert(original);
const hardpoints = {
  ...original.sprite.hardpoints,
  weaponMounts: [
    {
      id: 'front-1',
      slotIndex: 0,
      x: 215,
      y: 80,
      width: 6,
      layer: 'above',
      facing: 'forward',
      allowedMounts: ['forward'],
      allowedFamilies: ['railgun'],
      arcDegrees: 20,
    },
    {
      id: 'port-turret',
      slotIndex: 1,
      x: 150,
      y: 40,
      width: 6,
      layer: 'above',
      facing: 'port',
      allowedMounts: ['turret'],
      allowedFamilies: ['pulse_laser'],
      arcDegrees: 90,
    },
  ],
};
const ship = { ...original, sprite: { ...original.sprite, hardpoints } };
const loadouts = createShipLoadoutService();
const rail = getShipComponent('weapon', 'weapon-railgun-1');
const laser = getShipComponent('weapon', 'weapon1');
assert(rail?.weapon && laser?.weapon);
assert.equal(shipCanFitWeapon(ship, rail.weapon), true);
assert.equal(shipCanFitWeapon(ship, laser.weapon), true);
assert.equal(loadouts.setSlot(ship, 'weapon', 0, 'weapon-railgun-1'), true);
assert.equal(loadouts.setSlot(ship, 'weapon', 0, 'weapon1'), false);
assert.equal(loadouts.setSlot(ship, 'weapon', 1, 'weapon1'), true);
assert.equal(loadouts.setSlot(ship, 'weapon', 1, 'weapon-railgun-1'), false);
assert.equal(loadouts.setSlot(ship, 'weapon', 2, 'weapon1'), false);

const shooter = {
  setup: {
    weaponMounts: [
      {
        slotIndex: 0,
        x: 0,
        y: 0,
        facing: 'forward',
        allowedMounts: ['forward'],
        arcDegrees: 20,
      },
      {
        slotIndex: 1,
        x: 0,
        y: 0,
        facing: 'port',
        allowedMounts: ['turret'],
        arcDegrees: 90,
      },
    ],
  },
  position: { x: 0, y: 0 },
  headingRadians: 0,
};
assert.equal(weaponInArc(shooter, { x: 100, y: 0 }, 0, rail.weapon), true);
assert.equal(weaponInArc(shooter, { x: 100, y: 40 }, 0, rail.weapon), false);
assert.equal(weaponInArc(shooter, { x: 0, y: -100 }, 1, laser.weapon), true);
assert.equal(weaponInArc(shooter, { x: 100, y: 0 }, 1, laser.weapon), false);
assert.equal(weaponInArc(shooter, { x: 100, y: 0 }, 0, laser.weapon), false);
assert.equal(
  weaponInArc(shooter, { x: -100, y: 0 }, 1, { ...laser.weapon, arcDegrees: undefined }),
  false,
  'hardpoint must still restrict a turret whose profile omits arcDegrees'
);
assert.equal(
  weaponInArc({ ...shooter, setup: { weaponMounts: [] } }, { x: -100, y: 0 }, 1, { ...laser.weapon, arcDegrees: undefined }),
  true,
  'legacy turret with no arc uses full-circle firing'
);
console.log('PASS JSON weapon fitting slots and hardpoint firing arcs');
