'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const editor = fs.readFileSync(path.join(root, 'tools/hardpoint-editor.html'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert(editor.includes('window.showDirectoryPicker'), 'editor must open a local project folder');
assert(editor.includes('loadShipsFromServer()'), 'editor must preload ships before folder access');
assert(editor.includes('fetch("/"+path'), 'editor must fetch hardpoint JSONs from the dev server');
assert(editor.includes('fetch(url,{cache:"no-store"})'), 'editor must load ship sprites from the dev server');
assert(editor.includes('createWritable()'), 'editor must save JSON directly into the checkout');
assert(editor.includes('data-type="engines"'), 'editor must expose editable engine hardpoints');
assert(editor.includes('engines:{label:"Engine"'), 'engines must participate in editor selection and dragging');
assert(editor.includes('weaponLasers'), 'editor must expose weapon laser hardpoints');
assert(editor.includes('miningLasers'), 'editor must expose mining laser hardpoints');
assert(editor.includes('maneuverThrusters'), 'editor must expose RCS hardpoints');
assert(editor.includes('tractorBeams'), 'editor must expose tractor beam hardpoints');
assert(editor.includes('fieldLayer'), 'editor must expose above/below effect layering');
assert(editor.includes('width:7,layer:"below"'), 'new hardpoints must default to below');
assert(editor.includes('pointermove'), 'editor must support drag calibration on the ship sprite');
assert.equal(
  packageJson.scripts['hardpoints:edit'],
  'vite --open /tools/hardpoint-editor.html',
  'package script must launch the hardpoint editor'
);

console.log('PASS hardpoint editor contract');
