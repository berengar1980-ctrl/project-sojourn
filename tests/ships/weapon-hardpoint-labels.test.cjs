'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { weaponHardpointName, weaponHardpointDescription } = loadStandaloneTypeScriptModule(
  root,
  'src/core/weapon-hardpoint-labels.ts'
);

const patrol = JSON.parse(
  fs.readFileSync(
    path.join(root, 'src/data/ships/patrol-60m-variant-01.hardpoints.json'),
    'utf8'
  )
);
const mounts = patrol.weaponMounts;
assert.equal(mounts.length, 5, 'patrol must keep its five distinct hardpoints');
assert.deepEqual(
  mounts.map(weaponHardpointName),
  ['Bugwaffe', 'Backbordwaffe', 'Steuerbordwaffe', 'Geschützturm', 'Lenkwaffenwerfer']
);
assert.deepEqual(
  mounts.map(weaponHardpointDescription),
  [
    'Bugwaffe · 60° Feuerwinkel',
    'Backbordwaffe · 90° Feuerwinkel',
    'Steuerbordwaffe · 90° Feuerwinkel',
    'Geschützturm · 360° Feuerwinkel',
    'Lenkwaffenwerfer · 360° Zielerfassung',
  ]
);
assert.equal(mounts[3].facing, 'forward', 'display must not change turret orientation');
assert.equal(mounts[4].facing, 'forward', 'display must not change missile launch direction');
assert.deepEqual(mounts[3].allowedMounts, ['turret'], 'turret fitting must remain exclusive');
assert.deepEqual(mounts[4].allowedMounts, ['guided'], 'missile fitting must remain exclusive');
assert.equal(
  weaponHardpointDescription({ facing: 'port', allowedMounts: ['guided', 'broadside'] }),
  'Backbordwaffe · Winkel gemäß Waffe',
  'multi-purpose and legacy mounts must not be mislabelled as dedicated launchers'
);

const duel = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
const port = fs.readFileSync(path.join(root, 'src/features/port/port-ship-view-model.ts'), 'utf8');
const editor = fs.readFileSync(path.join(root, 'tools/hardpoint-editor.html'), 'utf8');
for (const [where, source] of [['duel', duel], ['campaign', port], ['editor', editor]]) {
  assert(source.includes('weaponHardpointDescription'), where + ' uses the same slot presentation');
}
assert(
  editor.includes('type="module"') && editor.includes('../src/core/weapon-hardpoint-labels.ts'),
  'editor must import the shared hardpoint formatter rather than duplicate classification'
);
console.log('PASS shared weapon hardpoint labels across duel, campaign and editor');
