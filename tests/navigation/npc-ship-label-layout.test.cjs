'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { layoutNpcMapLabels } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/map/npc-ship-label-layout.ts'
);

function npc(id, x, selected = false) {
  return {
    id,
    name: 'Captain ' + id,
    x,
    y: 70,
    shipWidth: 30,
    shipHeight: 20,
    isSelected: selected,
    isPursuitTarget: false,
    isTravelling: false,
  };
}

const labels = layoutNpcMapLabels([npc('a', 75), npc('b', 78), npc('c', 81)]);
assert(labels.length > 0);
for (let i = 0; i < labels.length; i += 1) {
  for (let j = i + 1; j < labels.length; j += 1) {
    const a = labels[i];
    const b = labels[j];
    const wA = a.name.length * 5.8 + 10;
    const wB = b.name.length * 5.8 + 10;
    assert(
      Math.abs(a.x - b.x) >= (wA + wB) / 2 + 4 ||
        Math.abs(a.baseline - b.baseline) >= 13 + 4,
      'labels must not overlap at crowded ports'
    );
  }
}
const priorityContacts = [npc('a', 75), npc('b', 78, true)];
const reservedSpace = [{ x: 78, y: 80, width: 100, height: 30 }];
const priority = layoutNpcMapLabels(priorityContacts, reservedSpace);
assert(priority.some((entry) => entry.id === 'b'), 'selected ship name always remains visible');
console.log('PASS NPC map labels avoid overlap while preserving selected targets');
