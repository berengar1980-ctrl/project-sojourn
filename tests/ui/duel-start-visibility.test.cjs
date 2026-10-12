'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/ui/start/start-menu.css'), 'utf8');
assert(
  lobby.includes('mapLabel, actions, cards'),
  'combat controls appear before growing loadout cards'
);
assert(css.includes('height: 100vh;'), 'duel lobby has a definite scrollable height');
assert(css.includes('overflow-y: auto;'), 'equipment can be scrolled');
assert(css.includes('.harrow-duel__actions {'), 'combat controls have a dedicated layout');
assert(css.includes('position: sticky;'), 'combat start controls remain visible');
console.log('PASS accessible combat start controls with tall PvP loadouts');
