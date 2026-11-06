'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const moduleUnderTest = loadStandaloneTypeScriptModule(root, 'src/ui/map/npc-ship-label-layout.ts');
const layoutNpcMapLabels = moduleUnderTest.layoutNpcMapLabels;

function contact(id, x, selected = false) {
  return {
    id,
    name: 'Ship ' + id,
    x,
    y: 70,
    shipWidth: 30,
    shipHeight: 20,
    isSelected: selected,
    isPursuitTarget: false,
    isTravelling: false,
  };
}

const ships = [contact('a', 75), contact('b', 78), contact('c', 81)];
const labels = layoutNpcMapLabels(ships);
assert(labels.length > 0);

for (let i = 0; i < labels.length; i += 1) {
  for (let j = i + 1; j < labels.length; j += 1) {
    const first = labels[i];
    const second = labels[j];
    const textWidth = 6 * 5.8 + 10;
    const horizontalOverlap = Math.abs(first.x - second.x) < textWidth + 4;
    const verticalOverlap = Math.abs(first.baseline - second.baseline) < 17;
    assert.equal(horizontalOverlap && verticalOverlap, false);
  }
}

const contactsAtLowZoom = [contact('a', 75), contact('b', 78), contact('c', 81)];
const ringObstacle = [{ x: 78, y: 70, width: 85, height: 55 }];
const distantLabels = layoutNpcMapLabels(contactsAtLowZoom, ringObstacle);
assert.equal(distantLabels.length, 3, 'all nearby ships should find alternative name positions');

const priorityContacts = [contact('a', 75), contact('b', 78, true)];
const reservedSpace = [{ x: 78, y: 80, width: 100, height: 30 }];
const priority = layoutNpcMapLabels(priorityContacts, reservedSpace);
assert(priority.some((entry) => entry.id === 'b'));

console.log('PASS NPC map labels avoid overlap and preserve selected targets');
