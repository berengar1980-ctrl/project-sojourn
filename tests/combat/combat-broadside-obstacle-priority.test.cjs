'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);

const cannon = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon-autocannon-1');
const turret = SHIP_COMPONENT_CATALOG.weapon.find((weapon) => weapon.id === 'weapon1');
assert(cannon && turret);

function setup(id, weapons) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 300,
    hullHp: 300,
    weapons,
    weaponMounts: [{ slotIndex: 0, x: 0, y: -10, facing: 'port' }],
    hitChance: 0.8,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 100,
    turnRateRadiansPerSecond: 2,
    accelerationMetersPerSecond2: 50,
    preferredTactic: 'fight',
  };
}

function firstTurn(withObstacle) {
  const arena = {
    width: 1800,
    height: 1200,
    attackerPosition: { x: 700, y: 500 },
    defenderPosition: { x: 1000, y: 500 },
    obstacles: withObstacle ? [{ id: 'asteroid', position: { x: 700, y: 590 }, radius: 55 }] : [],
  };
  const fight = createStrategicCombatService(
    setup('broadside', [cannon]),
    setup('target', [turret]),
    11,
    arena
  );
  return fight.tick(0.08).attacker.angularThrust;
}

assert(firstTurn(false) > 0, 'port broadside steers toward its gun side');
assert(firstTurn(true) < 0, 'nearby obstacle overrides broadside heading for safety');
console.log('PASS tactical broadside obstacle priority');
