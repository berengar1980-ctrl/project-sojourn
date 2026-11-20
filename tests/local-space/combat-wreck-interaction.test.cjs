'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const render = read('src/ui/local-space/local-space-renderer.ts');
const wreckRender = read('src/ui/local-space/local-combat-wreck-renderer.ts');
const input = read('src/ui/local-space/local-space-input.ts');
const panel = read('src/ui/local-space/local-space-panel.ts');
const selection = read('src/ui/local-space/local-combat-wreck-selection.ts');
const world = read('src/systems/operations/asteroid-field-world.ts');
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
  world.includes('advanceSalvageContainerDrift(field, dt)') &&
    bridge.includes('fieldWorld.advanceCombatWreckMotion(') &&
    bridge.includes("context.state.mode === 'salvage-space'") &&
    bridge.includes("context.state.embeddedCombat === 'local-space'"),
  'persistent combat wrecks reuse salvage physics without advancing twice during a duel'
);
console.log('PASS combat wreck hit areas, selection and native salvage 3D drift wiring');
