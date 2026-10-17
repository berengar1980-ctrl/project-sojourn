'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { weaponUiOrder, weaponUiGroup } = loadStandaloneTypeScriptModule(
  root,
  'src/core/weapon-hardpoint-labels.ts'
);
const mounts = JSON.parse(
  fs.readFileSync(
    path.join(root, 'src/data/ships/patrol-60m-variant-01.hardpoints.json'),
    'utf8'
  )
).weaponMounts;
const ordered = [...mounts].sort((a, b) => weaponUiOrder(a) - weaponUiOrder(b));
assert.deepEqual(
  ordered.map((mount) => mount.slotIndex),
  [0, 5, 1, 2, 3, 4],
  'UI shows both forward guns, sides, then universal turrets'
);
assert.deepEqual(
  ordered.map(weaponUiGroup),
  ['front', 'front', 'port', 'starboard', 'turret', 'turret']
);
const cards = fs.readFileSync(
  path.join(root, 'src/ui/start/duel-weapon-cards.ts'),
  'utf8'
);
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
const hud = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-weapon-telemetry-panel.ts'),
  'utf8'
);
assert(cards.includes('nativeWeaponDamage'), 'loadout displays actual battle damage values');
assert(cards.includes('fitsWeaponHardpoint'), 'selectors retain hardpoint restrictions');
assert(cards.includes('draft.weapons[mount.slotIndex]'), 'UI sorting never changes actual loadout');
assert(
  cards.includes("updateStats(stats, select.value, mount)"),
  'weapon selection refreshes stats'
);
assert(lobby.includes('buildDuelWeaponSections'), 'grouped selectors are displayed');
assert(hud.includes('shieldDamageDealt') && hud.includes('hullDamageDealt'));
assert(hud.includes('cooldownRemaining') && hud.includes('shotsFired'));
console.log('PASS six physical mount order, live loadout stats and weapon combat HUD contract');
