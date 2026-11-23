'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { fieldNpcCombatViews } = load('src/app/local-npc-combat-contacts.ts');
const { getShipDefinition } = load('src/systems/ships/index.ts');
const ship = getShipDefinition('miner-80m-variant-01');
assert(ship);
const setup = (id, x) => ({
  id,
  shipId: ship.id,
  position: { x, y: 100 },
  headingRadians: 0.5,
  speed: 80,
  hullHp: 100,
});
const combat = {
  attacker: setup('missing-fighter', 190),
  defender: setup('visible-fighter', 270),
};
const existing = [
  {
    id: 'visible-fighter',
    name: 'Old position',
    position: { x: 10, y: 10 },
    headingRadians: 0,
    speed: 0,
    phase: 'approaching',
    targetAsteroidId: null,
    laserActive: true,
    nominalLengthMeters: ship.nominalLengthMeters,
    spriteUrl: ship.sprite.assetUrl,
    spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
    hardpoints: ship.sprite.hardpoints,
  },
];
const npcs = [{ id: 'missing-fighter', name: 'Faustus Ferrox', pirate: false }];
const result = fieldNpcCombatViews(existing, [combat], npcs, new Set(), null);
assert.equal(result.length, 2, 'one authoritative sprite per live NPC fighter');
assert.equal(result.find((v) => v.id === 'visible-fighter').position.x, 270);
assert.equal(result.find((v) => v.id === 'visible-fighter').laserActive, false);
assert.equal(result.find((v) => v.id === 'missing-fighter').position.x, 190);
assert.equal(result.find((v) => v.id === 'missing-fighter').name, 'Faustus Ferrox');
assert.equal(
  fieldNpcCombatViews(existing, [combat], npcs, new Set(['missing-fighter']), null).length,
  1
);
assert.equal(
  fieldNpcCombatViews(
    [],
    [{ attacker: setup('security-drone:field', 0), defender: setup('player', 1) }],
    npcs,
    new Set(),
    null
  ).length,
  0,
  'native drone and player rendering must never be duplicated in the civilian layer'
);
console.log('PASS combat actor remains visible when miner/traffic snapshot hands off');
