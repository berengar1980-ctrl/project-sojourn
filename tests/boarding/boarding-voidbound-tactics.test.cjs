'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createBoardingTacticalService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/boarding/boarding-tactical-service.ts'
);
const { boardingRangedWeapons, boardingMeleeWeapons } = loadStandaloneTypeScriptModule(
  root,
  'src/data/boarding/boarding-weapons.ts'
);

function encounter(overrides = {}) {
  return createBoardingTacticalService({
    seed: 203,
    mapId: 'long-corridor',
    playerUnits: [
      {
        id: 'sentry',
        name: 'Sentry',
        team: 'player',
        hp: 20,
        meleeSkill: 85,
        rangedSkill: 90,
        weapon: boardingRangedWeapons.rifle,
        meleeWeapon: boardingMeleeWeapons.knife,
      },
    ],
    enemyUnits: [
      {
        id: 'intruder',
        name: 'Intruder',
        team: 'enemy',
        hp: 20,
        meleeSkill: 40,
        rangedSkill: 40,
        weapon: boardingRangedWeapons.sidearm,
      },
    ],
    ...overrides,
  });
}

function unit(service, id) {
  return service.getSnapshot().units.find((entry) => entry.id === id);
}

// A single directional overwatch shot triggers while the opposing unit moves.
{
  const tactical = encounter();
  assert.equal(tactical.overwatch('sentry', { q: 4, r: 1 }), true);
  assert.equal(unit(tactical, 'sentry').ap, 1);
  assert.equal(unit(tactical, 'sentry').overwatch, true);
  tactical.endTurn();
  assert.equal(tactical.move('intruder', { q: 5, r: 1 }), true);
  assert.equal(unit(tactical, 'sentry').overwatch, false);
  assert.equal(unit(tactical, 'sentry').rangedActions, 1);
  assert.equal(tactical.getSnapshot().randomCalls, 1);
  assert.equal(tactical.getSnapshot().outcome, 'active');
}

// Suppression zones persist into the enemy movement phase and fire once.
{
  const tactical = encounter();
  assert.equal(tactical.suppressArea('sentry', { q: 4, r: 1 }), true);
  assert.equal(tactical.getSnapshot().suppressionZones.length, 1);
  tactical.endTurn();
  assert.equal(tactical.move('intruder', { q: 5, r: 1 }), true);
  assert.equal(unit(tactical, 'intruder').suppressed, true);
  assert.equal(unit(tactical, 'sentry').rangedActions, 2);
  assert.equal(tactical.getSnapshot().suppressionZones.length, 0);
}

// A melee disengagement reaction cannot be triggered repeatedly in one turn.
{
  const initial = encounter().getSnapshot();
  const changed = {
    ...initial,
    activeTeam: 'enemy',
    units: initial.units.map((entry) =>
      entry.id === 'sentry'
        ? { ...entry, q: 2, r: 1 }
        : { ...entry, q: 3, r: 1 }
    ),
  };
  const tactical = encounter({ restore: changed });
  assert.equal(tactical.move('intruder', { q: 4, r: 1 }), true);
  assert.equal(unit(tactical, 'sentry').meleeActions, 1);
  assert.equal(unit(tactical, 'sentry').reactionUsed, true);
}

// Holding directional cover costs AP and expires when a unit moves.
{
  const initial = encounter().getSnapshot();
  const changed = {
    ...initial,
    units: initial.units.map((entry) =>
      entry.id === 'sentry' ? { ...entry, q: 3, r: 1 } : entry
    ),
  };
  const tactical = encounter({ restore: changed });
  assert.equal(tactical.holdCover('sentry'), true);
  assert.equal(unit(tactical, 'sentry').holdingCover, true);
  assert.equal(tactical.holdCover('sentry'), false);
  assert.equal(tactical.move('sentry', { q: 4, r: 1 }), true);
  assert.equal(unit(tactical, 'sentry').holdingCover, false);
}

// Closed bulkheads are passability obstacles until opened via the service.
{
  const initial = encounter({ mapId: 'bulkhead-door' }).getSnapshot();
  const changed = {
    ...initial,
    units: initial.units.map((entry) =>
      entry.id === 'sentry' ? { ...entry, q: 3, r: 3 } : entry
    ),
  };
  const tactical = encounter({ restore: changed });
  assert.equal(tactical.move('sentry', { q: 4, r: 3 }), false);
  assert.equal(tactical.openDoor('sentry', 'door-4-3'), true);
  assert.equal(tactical.move('sentry', { q: 4, r: 3 }), true);
}

// Save/restore preserves tactical RNG, AP, injuries and reaction flags.
{
  const tactical = encounter();
  assert.equal(tactical.move('sentry', { q: 2, r: 1 }), true);
  assert(tactical.shoot('sentry', 'intruder'), 'target now within rifle range');
  const checkpoint = tactical.getSnapshot();
  const restored = encounter({ restore: checkpoint });
  assert.deepEqual(restored.getSnapshot(), checkpoint);
  tactical.endTurn();
  tactical.endTurn();
  restored.endTurn();
  restored.endTurn();
  assert.deepEqual(restored.getSnapshot(), tactical.getSnapshot());
  assert.deepEqual(restored.shoot('sentry', 'intruder'), tactical.shoot('sentry', 'intruder'));
  assert.deepEqual(restored.getSnapshot(), tactical.getSnapshot());
}

// A crew defending its own ship cannot retreat from an enemy boarding.
{
  const tactical = encounter({ allowRetreat: false });
  assert.equal(tactical.getSnapshot().allowRetreat, false);
  assert.equal(tactical.retreat().outcome, 'active');
}

const panel = fs.readFileSync(
  path.join(root, 'src/ui/boarding/boarding-tactical-panel.ts'),
  'utf8'
);
assert(panel.includes('this.tactical.openDoor(selected.id, door.id)'));
assert(panel.includes('data-boarding-action'));
assert(panel.includes('this.tactical.overwatch'));
assert(panel.includes('this.tactical.suppressArea'));

console.log('PASS Voidbound boarding reactions, suppression, cover, doors, restore and UI actions');
