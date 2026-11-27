'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const render = read('src/ui/local-space/local-space-renderer.ts');
const wreckRender = read('src/ui/local-space/local-combat-wreck-renderer.ts');
const input = read('src/ui/local-space/local-space-input.ts');
const panel = read('src/ui/local-space/local-space-panel.ts');
const selection = read('src/ui/local-space/local-combat-wreck-selection.ts');
const bridge = read('src/app/game-controller-field-world-bridge.ts');

assert(
  wreckRender.includes('hitAreas.push({ id: wreck.id, point, radius: hitRadius })') &&
    wreckRender.includes('selectedWreckId'),
  'combat hull meshes must register real, visible, selectable hit areas'
);
assert(
  render.includes('pickCombatWreck(x: number, y: number)') &&
    render.includes('this.combatWreckHitAreas = drawMiningCombatWrecks('),
  'mining renderer must provide combat wreck picking'
);
assert(
  input.includes('renderer.pickCombatWreck(point.x, point.y)') &&
    input.indexOf('renderer.pickCombatWreck(point.x, point.y)') <
      input.indexOf('renderer.pickAsteroid(point.x, point.y)') &&
    input.includes('onSelectCombatWreck?.(wreckId)'),
  'wreck clicks must select rather than issue a movement route or mining instruction'
);
assert(
  panel.includes('showLocalCombatWreckSelection(controls, model, selectedCombatWreckId)') &&
    selection.includes('BERGUNG // KAMPFWRACK') &&
    selection.includes('BERGUNGSSCHIFF ERFORDERLICH') &&
    selection.includes('controls.mineButton.hidden = true'),
  'selected combat wreck shows loot and never activates an asteroid mining operation'
);
assert(
  bridge.includes(
    'advanceRemainingWreckMotion(context, fieldWorld, deltaSeconds, localId, combatLocations)'
  ),
  'the field world tick must delegate remaining wreck motion to the lifecycle module'
);

// Exercise the actual lifecycle and asteroid field world. Spy only on the
// shared salvage physics boundary to count how many times each field is moved.
const moved = [];
const motion = {
  advanceSalvageContainerDrift(field, dt) {
    moved.push({ locationId: field.sourceLocationId, dt });
  },
  invalidateSalvagePhysics() {},
};
const motionPath = 'src/systems/salvage/salvage-container-motion.ts';
const { AsteroidFieldWorld } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/operations/asteroid-field-world.ts',
  { [motionPath]: motion }
);
const ids = ['free-field', 'mining-scene', 'salvage-scene', 'npc-duel', 'background-salvage'];
const { advanceRemainingWreckMotion } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-field-wreck-lifecycle.ts',
  {
    [motionPath]: motion,
    'src/data/maps/narrows-sector.ts': {
      narrowsSector: { locations: ids.map((id) => ({ id })) },
    },
    'src/app/game-controller-salvage-drone-world.ts': {
      backgroundSalvagePatrol: (_context, id) => id === 'background-salvage',
    },
  }
);
const fieldWorld = new AsteroidFieldWorld([], {}, () => {
  throw new Error('No mining fields expected in this fixture');
});
for (const id of ids) {
  fieldWorld.registerCombatWrecks(id, [
    { id: 'combat-wreck-' + id, combatWreckVariant: 'test-wreck' },
  ]);
}

function assertMotion(state, localId, expected) {
  moved.length = 0;
  const combatLocations = new Set(['npc-duel']);
  advanceRemainingWreckMotion({ state }, fieldWorld, 0.05, localId, combatLocations);
  assert.deepEqual(
    moved.map((entry) => entry.locationId).sort(),
    [...expected].sort(),
    'only fields without an active physics owner may advance, exactly once'
  );
  assert(moved.every((entry) => entry.dt === 0.05));
  assert(combatLocations.has('background-salvage'));
}

assertMotion({ mode: 'star-map' }, null, ['free-field', 'mining-scene', 'salvage-scene']);
assertMotion({ mode: 'local-space', embeddedCombat: 'local-space' }, 'mining-scene', [
  'free-field',
  'salvage-scene',
]);
assertMotion(
  {
    mode: 'salvage-space',
    salvageScene: { getField: () => ({ sourceLocationId: 'salvage-scene' }) },
  },
  null,
  ['free-field', 'mining-scene']
);
console.log('PASS combat wreck hit areas, selection and single-owner salvage physics');
