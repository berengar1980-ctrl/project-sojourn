'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const {
  createPlayerProfile,
  snapshotPlayerProfile,
  withPlayerShipName,
  playerPortraitUrl,
  PORTRAIT_IDS,
} = loadStandaloneTypeScriptModule(root, 'src/core/player-profile.ts');

const profile = createPlayerProfile({
  portraitId: 4,
  captainName: '  Mara Voss  ',
  shipName: '  Die Wanderin  ',
});
assert.deepEqual({ ...profile }, {
  portraitId: 4,
  captainName: 'Mara Voss',
  shipName: 'Die Wanderin',
});
assert(Object.isFrozen(profile), 'profile is owned by immutable controller state');
assert.notStrictEqual(snapshotPlayerProfile(profile), profile, 'snapshot must be detached');
assert.deepEqual(PORTRAIT_IDS, [1, 2, 3, 4, 5]);
for (const id of [1, 4, 5]) {
  assert.equal(playerPortraitUrl(id), '/portraits/portrait-' + id + '.webp');
  assert(fs.existsSync(path.join(root, 'public/portraits/portrait-' + id + '.webp')));
}
assert.equal(playerPortraitUrl(2), null);
assert.equal(playerPortraitUrl(3), null);
for (const invalid of [
  { ...profile, captainName: ' ' },
  { ...profile, shipName: '\n' },
  { ...profile, shipName: 'x'.repeat(33) },
  { ...profile, portraitId: 9 },
]) {
  assert.throws(() => createPlayerProfile(invalid));
}
const ship = { id: 'salvage-v1', name: 'Default Ship', role: 'salvage' };
const renamed = withPlayerShipName(ship, profile);
assert.equal(renamed.name, 'Die Wanderin');
assert.equal(ship.name, 'Default Ship', 'original definition is never mutated');
assert.equal(withPlayerShipName(ship, profile, 'other-ship'), ship, 'other hulls retain their name');

const bootstrap = read('src/app/bootstrap.ts');
const controller = read('src/app/game-controller.ts');
const editor = read('src/ui/start/character-editor.ts');
const bar = read('src/ui/settings/settings-menu.ts');
assert(bootstrap.includes('createCharacterEditor('), 'campaign enters character editor');
assert(bootstrap.includes('launchCampaign(root, profile)'), 'submission launches existing campaign');
assert(bootstrap.includes('withPlayerShipName(ship, profile)'), 'starter gets chosen name');
assert(controller.includes('snapshotPlayerProfile(state.playerProfile)'), 'controller exposes snapshot');
assert(controller.includes('withPlayerShipName(nextShip, state.playerProfile, state.starterShipId)'), 'reselecting starting hull keeps name');
assert(editor.includes('form.reportValidity()'), 'editor prevents incomplete submission');
assert(editor.includes('onBack'), 'editor supports cancel / back');
assert(bar.includes('settings-menu__identity'), 'captain and ship identity is displayed in play');
console.log('PASS character creation profile, ship naming and campaign entry');
