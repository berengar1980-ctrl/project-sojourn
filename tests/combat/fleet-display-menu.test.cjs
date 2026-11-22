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
const keys = ['lines', 'assignments', 'actions', 'names', 'boost', 'overview', 'hud', 'events'];
assert.equal(details.tag, 'details');
assert.equal(rows.length, keys.length);
assert(keys.every((key) => menu.get()[key] === true));

let changes = 0;
menu.onChange(() => changes++);
// Each option is independent; turning off text does not alter visual effects.
rows[2].children[0].checked = false;
rows[2].children[0].fire('change');
assert.equal(menu.get().actions, false);
assert.equal(menu.get().lines, true);
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

console.log('PASS fleet display menu independent toggles, show/hide-all and persisted settings');
