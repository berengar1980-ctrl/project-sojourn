'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const markup = read('src/ui/port/port-secondary-panes.ts');
const panel = read('src/ui/port/port-panel.ts');
const browser = read('src/ui/port/port-shipyard-browser.ts');
const view = read('src/features/port/port-view-model.ts');
const controller = read('src/app/game-controller-port.ts');

assert(markup.includes('data-yard-view="ships"'));
assert(markup.includes('data-yard-view="components"'));
for (const role of ['patrol', 'mining', 'salvage', 'freighter']) {
  assert(markup.includes('value="' + role + '"'));
}
assert(markup.includes('data-yard-role-select'));
assert(markup.includes('data-yard-ship-select'));
assert(markup.includes('data-yard-ship="${offer.id}"'));
assert(markup.includes('data-buy-ship-id="${offer.id}"'));
for (const key of [
  'spriteUrl',
  'lengthMeters',
  'cargoCapacityTons',
  'speed',
  'hullMaxHp',
  'shieldMaxHp',
  'weaponSlots',
  'crewBerths',
  'maxComponentTier',
]) {
  assert(markup.includes('offer.' + key), 'ship preview missing ' + key);
  assert(
    view.includes(key + ': number') || (key === 'spriteUrl' && view.includes('spriteUrl: string'))
  );
  assert(controller.includes(key + ':'), 'ship data must originate from ship definitions');
}
assert(panel.includes('bindShipyardBrowser(shell)'));
assert(browser.includes('lastYardView'));
assert(browser.includes('lastYardRole'));
assert(panel.includes('options.onBuyShip(button.dataset.buyShipId'));
assert(markup.includes('data-yard-section="components"'));
console.log('PASS shipyard tabs, role filtering, offer previews and purchasing wiring');
