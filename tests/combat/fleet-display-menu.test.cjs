'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');

const storage = new Map();
global.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, value);
  },
};
function element(tag) {
  return {
    tag,
    children: [],
    listeners: new Map(),
    style: {},
    classList: { toggle() {} },
    checked: false,
    append(...nodes) {
      this.children.push(...nodes);
    },
    setAttribute() {},
    addEventListener(event, callback) {
      this.listeners.set(event, callback);
    },
    fire(event) {
      this.listeners.get(event)?.();
    },
  };
}
global.document = {
  createElement: element,
  createTextNode: (text) => ({ tag: '#text', text }),
};
const { createFleetDisplayMenu } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/fleet-display-menu.ts'
);
const shell = element('section');
const menu = createFleetDisplayMenu(shell);
const details = shell.children[0];
const body = details.children[1];
const rows = body.children.filter((child) => child.tag === 'label');
const actions = body.children.find((child) => child.tag === 'div');
const keys = [
  'lines',
  'assignments',
  'actions',
  'maneuvers',
  'names',
  'boost',
  'overview',
  'playerHud',
  'enemyHud',
  'playerWeapons',
  'enemyWeapons',
  'playerMarker',
  'events',
];
assert.equal(details.tag, 'details');
assert.equal(rows.length, keys.length);
assert(keys.every((key) => menu.get()[key] === (key !== 'playerMarker')));

let changes = 0;
menu.onChange(() => changes++);
// Each option is independent; turning off text does not alter visual effects.
rows[2].children[0].checked = false;
rows[2].children[0].fire('change');
assert.equal(menu.get().actions, false);
assert.equal(menu.get().lines, true);
assert.equal(menu.get().maneuvers, true);
assert.equal(menu.get().assignments, true);
assert.equal(changes, 1);

actions.children[1].fire('click');
assert(keys.every((key) => menu.get()[key] === false));
assert(rows.every((row) => row.children[0].checked === false));
actions.children[0].fire('click');
assert(keys.every((key) => menu.get()[key] === true));
assert.equal(changes, 3);

// The compact settings persist for the next FleetCombat test match.
rows[0].children[0].checked = false;
rows[0].children[0].fire('change');
const restored = createFleetDisplayMenu(element('section'));
assert.equal(restored.get().lines, false);
assert.equal(restored.get().names, true);
assert.equal(restored.get().actions, true);
const weaponRow = rows[keys.indexOf('playerWeapons')].children[0];
weaponRow.checked = false;
weaponRow.fire('change');
assert.equal(menu.get().enemyWeapons, true);
assert.equal(menu.get().playerHud, true);
assert.equal(menu.get().enemyHud, true);
assert.equal(menu.get().playerMarker, true);
storage.set('sojourn.fleet-combat.display.v1', JSON.stringify({ hud: false, actions: false }));
const legacy = createFleetDisplayMenu(element('section'), ['overview']);
assert.equal(legacy.get().playerHud, false);
assert.equal(legacy.get().enemyHud, false);
assert.equal(legacy.get().maneuvers, false);
assert.equal(legacy.get().playerMarker, false);

const { createEmbeddedCombatHud } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/embedded-combat-hud.ts'
);
const hudHost = element('section');
const hud = createEmbeddedCombatHud(hudHost);
const ship = {
  name: 'Testschiff',
  shieldHp: 40,
  hullHp: 80,
  subsystems: { engine: 60, tractor: 60, maximum: 80 },
  tactic: 'fight',
  weaponTelemetry: [
    {
      weaponName: 'Railgun',
      mountLabel: 'Bugwaffe',
      displayOrder: 0,
      shotsFired: 3,
      cooldownRemaining: 0.5,
      cooldownSeconds: 3,
      shieldDamageDealt: 2,
      hullDamageDealt: 4,
      lastFiredAt: 0,
    },
  ],
};
const battle = { attacker: ship, defender: ship, elapsedSeconds: 4 };
const [playerHud, enemyHud] = hudHost.children;
hud.update(battle, { ...menu.get(), playerWeapons: false, enemyWeapons: true });
assert.equal(playerHud.hidden, false);
assert(!playerHud.innerHTML.includes('combat-weapon-row__shots'));
assert(enemyHud.innerHTML.includes('combat-weapon-row__shots'));
hud.update(battle, { ...menu.get(), playerHud: true, enemyHud: false, playerWeapons: true });
assert.equal(playerHud.hidden, false);
assert(playerHud.innerHTML.includes('combat-weapon-row__shots'));
assert.equal(enemyHud.hidden, true);
hud.update(null);
assert([playerHud, enemyHud].every((panel) => panel.hidden));

console.log('PASS fleet display menu independent toggles, show/hide-all and persisted settings');
