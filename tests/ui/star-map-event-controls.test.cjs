'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');

class Element {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.checked = false;
    this.value = '';
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  fire(name) { this.listeners[name]?.(); }
  querySelector(selector) {
    const kind = selector.match(/star-map-event-filter--([a-z]+)/)?.[1];
    if (!kind) return null;
    const choices = this.children.find((child) =>
      child.className === 'star-map-event-filters__choices');
    return choices?.children.find((child) =>
      child.className.endsWith('--' + kind))?.children[0] ?? null;
  }
  querySelectorAll(selector) {
    if (selector !== '.star-map-event-filters__presets button') return [];
    return this.children.find((child) =>
      child.className === 'star-map-event-filters__presets')?.children ?? [];
  }
}

global.document = {
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => ({ textContent: text }),
};
const { defaultMissionFilters, missionFilterControls } = loadStandaloneTypeScriptModule(
  root, 'src/ui/map/star-map-event-filters.ts'
);
let updated = defaultMissionFilters('salvage');
let notifications = 0;
const counts = { distress: 2, salvage: 5, trade: 1, mining: 0,
  patrol: 1, blockade: 0, campaign: 2 };
const controls = missionFilterControls(updated, counts, (next) => {
  notifications += 1;
  updated = next;
});
const choice = (kind) => controls.querySelector('.star-map-event-filter--' + kind + ' input');
choice('distress').checked = false;
choice('distress').fire('change');
choice('trade').checked = true;
choice('trade').fire('change');
assert.equal(notifications, 2, 'one interaction must produce one state change');
assert.equal(updated.distress, false, 'second toggle must not discard first toggle');
assert.equal(updated.trade, true);
assert.equal(choice('distress').checked, false);
const buttons = controls.querySelectorAll('.star-map-event-filters__presets button');
buttons.find((button) => button.textContent === 'Alle').fire('click');
assert.equal(updated.distress, true);
assert.equal(choice('distress').checked, true, 'presets must synchronize checkbox visuals');
assert.equal(choice('mining').checked, true);
const sortLabel = controls.children.find((child) =>
  child.className === 'star-map-event-filters__sort');
const select = sortLabel.children.at(-1);
select.value = 'danger';
select.fire('change');
assert.equal(updated.sort, 'danger');
assert.equal(controls.children.includes(sortLabel), true, 'dropdown node must not be replaced');
assert.equal(notifications, 4);

console.log('PASS single-click filter changes, repeated toggles, presets and stable dropdown');
