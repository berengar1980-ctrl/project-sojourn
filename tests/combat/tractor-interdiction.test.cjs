'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { defaultInstalledShipComponents } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-mining-capability.ts'
);
const { getShipComponent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);

function combatant(id, shieldHp, tractorRangeMeters = 0) {
  return {
    id,
    name: id,
    shipId: 'test',
    shieldHp,
    hullHp: 100,
    weapons: [],
    hitChance: 0,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 180,
    tractorRangeMeters,
    aiControlled: false,
  };
}

const tractor = getShipComponent('tractor', 'tractor1');
assert(tractor);
assert.equal(tractor.type, 'tractor');
assert(tractor.range > 0);
const mockShip = (role) => ({ role, gameplayOverrides: {}, sprite: { hardpoints: {} } });
assert.deepEqual(defaultInstalledShipComponents(mockShip('mining')).tractor, ['tractor1']);
assert.deepEqual(defaultInstalledShipComponents(mockShip('salvage')).tractor, ['tractor1']);
assert.deepEqual(defaultInstalledShipComponents(mockShip('patrol')).tractor, ['']);
assert.deepEqual(defaultInstalledShipComponents(mockShip('freighter')).tractor, ['']);

const combat = createStrategicCombatService(
  combatant('runner', 0),
  combatant('hunter', 100, 800),
  123,
  {
    width: 1800,
    height: 1200,
    attackerPosition: { x: 900, y: 550 },
    defenderPosition: { x: 1200, y: 550 },
  }
);
combat.setTactic('attacker', 'flee');
assert.equal(combat.getSnapshot().attacker.tractorLocked, true);
for (let i = 0; i < 20; i++) combat.tick(0.08);
assert.equal(combat.getSnapshot().attacker.tractorLocked, true);
assert(combat.getSnapshot().attacker.speed <= 25);

const shielded = createStrategicCombatService(
  combatant('shielded-runner', 20),
  combatant('hunter', 100, 800),
  123,
  {
    width: 1800,
    height: 1200,
    attackerPosition: { x: 900, y: 550 },
    defenderPosition: { x: 1200, y: 550 },
  }
);
assert.equal(shielded.getSnapshot().attacker.tractorLocked, false);

console.log('PASS tractor equipment defaults and shield-gated escape interdiction');
