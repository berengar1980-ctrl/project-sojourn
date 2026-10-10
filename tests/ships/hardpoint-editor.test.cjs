'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const editor = fs.readFileSync(path.join(root, 'tools/hardpoint-editor.html'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert(editor.includes('loadShipsFromServer()'), 'editor must preload ships on startup');
assert(
  editor.includes('async function loadShipsFromServer()'),
  'ship autoload implementation must exist'
);
assert(editor.includes('async function loadImage(ship)'), 'ship sprite loader must exist');
assert(editor.includes('fetch("/"+path'), 'editor must fetch hardpoint JSONs from the dev server');
assert(
  editor.includes('fetch(url,{cache:"no-store"})'),
  'editor must load ship sprites from the dev server'
);
assert(
  editor.includes('/__sojourn/hardpoints/save'),
  'editor must save through the local Vite hardpoint endpoint'
);
assert(!editor.includes('showDirectoryPicker'), 'editor must not require project-folder selection');
assert(!editor.includes('createWritable'), 'editor must not use browser file handles');
assert(editor.includes('data-type="engines"'), 'editor must expose editable engine hardpoints');
assert(
  editor.includes('engines:{label:"Engine"'),
  'engines must participate in editor selection and dragging'
);
assert(editor.includes('data-type="weaponMounts"'), 'editor must expose combat weapon hardpoints');
assert(editor.includes('fieldFacing'), 'editor must allow front / port / starboard calibration');
assert(editor.includes('fieldArcDegrees'), 'editor must allow hardpoint cone calibration');
assert(editor.includes('weaponAllowed'), 'editor must configure compatible weapon mount types');
assert(
  editor.includes('weaponFamily'),
  'editor must configure individual weapon family restrictions'
);
assert(editor.includes('weaponLasers'), 'editor must expose weapon laser hardpoints');
assert(editor.includes('miningLasers'), 'editor must expose mining laser hardpoints');
assert(editor.includes('maneuverThrusters'), 'editor must expose RCS hardpoints');
assert(editor.includes('tractorBeams'), 'editor must expose tractor beam hardpoints');
assert(editor.includes('fieldLayer'), 'editor must expose above/below effect layering');
assert(editor.includes('width:7,layer:"below"'), 'new hardpoints must default to below');
assert(editor.includes('pointermove'), 'editor must support drag calibration on the ship sprite');
assert(editor.includes('data-mode="shield"'), 'editor must expose a dedicated shield mode');
assert(editor.includes('shieldCenterX'), 'shield editor must expose the shield center');
assert(
  editor.includes('shieldRadiusX') && editor.includes('shieldRadiusY'),
  'shield editor must expose both ellipse radii'
);
assert(
  editor.includes('shieldMaxHp') && editor.includes('shieldModifier'),
  'shield editor must expose shield HP and modifier'
);
assert(
  editor.includes('ctx.ellipse(center.x,center.y'),
  'shield mode must draw the configured ellipse'
);
assert(editor.includes('state.dragKind==="radiusX"'), 'shield radius X must be draggable');
assert(editor.includes('state.dragKind==="radiusY"'), 'shield radius Y must be draggable');
assert.equal(
  packageJson.scripts['hardpoints:edit'],
  'vite --open /tools/hardpoint-editor.html',
  'package script must launch the hardpoint editor'
);

console.log('PASS hardpoint editor contract');
