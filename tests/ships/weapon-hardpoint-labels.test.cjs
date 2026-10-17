'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const labels = loadStandaloneTypeScriptModule(root, 'src/core/weapon-hardpoint-labels.ts');
const shipFile = path.join(root, 'src/data/ships/patrol-60m-variant-01.hardpoints.json');
const mounts = JSON.parse(fs.readFileSync(shipFile, 'utf8')).weaponMounts;

assert.equal(mounts.length, 6);
assert.equal(labels.weaponHardpointName(mounts[0]), 'Bugwaffe');
assert.equal(labels.weaponHardpointName(mounts[1]), 'Backbordwaffe');
assert.equal(labels.weaponHardpointName(mounts[2]), 'Steuerbordwaffe');
assert.equal(labels.weaponHardpointName(mounts[3]), 'Universalwaffe');
assert.equal(labels.weaponHardpointName(mounts[4]), 'Universalwaffe');
assert.equal(labels.weaponHardpointDescription(mounts[0]), 'Bugwaffe · 60° Feuerwinkel');
assert.equal(labels.weaponHardpointDescription(mounts[1]), 'Backbordwaffe · 90° Feuerwinkel');
assert.equal(labels.weaponHardpointDescription(mounts[2]), 'Steuerbordwaffe · 90° Feuerwinkel');
assert.equal(labels.weaponHardpointDescription(mounts[3]), 'Universalwaffe · 360° Feuerwinkel');
assert.equal(labels.weaponHardpointDescription(mounts[4]), 'Universalwaffe · 360° Feuerwinkel');
assert.equal(mounts[3].facing, 'forward');
assert.equal(mounts[4].facing, 'forward');
assert.deepEqual(mounts[3].allowedMounts, ['turret', 'guided']);
assert.deepEqual(mounts[4].allowedMounts, ['turret', 'guided']);

const legacy = { facing: 'port', allowedMounts: ['guided', 'broadside'] };
assert.equal(labels.weaponHardpointDescription(legacy), 'Backbordwaffe · Winkel gemäß Waffe');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

assert(read('src/ui/start/duel-lobby.ts').includes('weaponHardpointDescription'));
assert(read('src/features/port/port-ship-view-model.ts').includes('weaponHardpointDescription'));
const editor = read('tools/hardpoint-editor.html');
assert(editor.includes('weaponHardpointDescription'));
assert(editor.includes('type="module"'));
assert(editor.includes('../src/core/weapon-hardpoint-labels.ts'));

console.log('PASS shared weapon hardpoint labels across duel, campaign and editor');
