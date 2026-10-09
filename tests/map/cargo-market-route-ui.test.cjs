'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const ui = fs.readFileSync(path.join(root, 'src/ui/map/star-map-cargo-scanner.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');

assert(ui.includes('BESTER BEKANNTER GESAMTVERKAUF'));
assert(ui.includes('BESTER VERMUTETER GESAMTMARKT'));
assert(ui.includes('quote.coveredQuantity === quote.totalQuantity'));
assert(ui.includes("route.addEventListener('click', () => onNavigate(quote.locationId))"));
assert(ui.includes("route.addEventListener('click', () => onNavigate(hint.locationId))"));
assert(panel.includes('options.onSelectLocation'));
console.log('PASS cargo market recommendations and route selection controls');
