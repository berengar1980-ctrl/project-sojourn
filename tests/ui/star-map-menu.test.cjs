'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const panel = read('src/ui/map/star-map-panel.ts');
const menu = read('src/ui/map/star-map-menu.ts');
const lists = read('src/ui/map/star-map-menu-content.ts');
const market = read('src/ui/map/star-map-cargo-scanner.ts');
const css = read('src/ui/styles/star-map-menu.css');
const bootstrap = read('src/main.ts');

for (const id of ['map', 'trade', 'contacts', 'missions', 'system']) {
  assert(menu.includes("id: '" + id + "'"), 'missing map menu section: ' + id);
}
assert(menu.includes('setSection(selected === item.id ? null : item.id)'));
assert(menu.includes("event.key === 'Escape'"));
assert(menu.includes("document.removeEventListener('pointerdown', closeOutside)"));
assert(menu.includes("window.removeEventListener('keydown', onKeyDown)"));

assert(panel.includes('populateStarMapMenu(menu, controls)'));
assert(panel.includes('bindMapDisplayOptions('));
assert(panel.includes('menu.tradePane.append(tradeHeading, cargoToggle, cargoPanel)'));
assert(panel.includes('root: menu.systemPane'));
assert(panel.includes('renderStarMapContacts('));
assert(panel.includes('renderStarMapEvents('));
assert(panel.includes("if (section === 'trade') renderCargoScanner()"));
assert(panel.includes('const updateTicker = createStarMapTicker('));
assert(panel.includes('menu.destroy()'));

assert(lists.includes('model.npcShips.map('));
assert(lists.includes("location.kind !== 'wreck'"));
assert(lists.includes('actions.onSelectNpc(npc.id)'));
assert(lists.includes('actions.onSelectLocation(location.id)'));
assert(market.includes('preferredCargoVisible ? cargoMarkers('));
assert(!market.includes('cargoPanel.hidden = !preferredCargoVisible'));

assert(css.includes('.star-map-menu__drawer[hidden]'));
assert(css.includes('.star-map-menu__pane .system-log'));
assert(css.includes('@media (max-width: 650px)'));
assert(bootstrap.includes("import './ui/styles/star-map-menu.css'"));

console.log('PASS lightweight star map menu integrations and existing actions');
