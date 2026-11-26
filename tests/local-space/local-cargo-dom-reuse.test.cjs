'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { renderCargo } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/local-space/local-space-panel-view.ts'
);

class FakeElement {
  children = [];
  text = '';
  writes = 0;
  replacements = 0;
  get textContent() {
    return this.text;
  }
  set textContent(value) {
    this.text = value;
    this.writes++;
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
    this.replacements++;
  }
}

global.document = { createElement: () => new FakeElement() };
const total = new FakeElement();
const list = new FakeElement();
const resource = (resourceId, name, amount) => ({ resourceId, name, amount });
const show = (cargoResources, collectedOre = 0) =>
  renderCargo({ cargoResources, collectedOre }, total, list);
show([]);
const empty = list.children[0];
show([]);
assert.strictEqual(list.children[0], empty);
assert.equal(list.replacements, 1);
show([resource('ore-a', 'Ferrite', 10)], 10);
const row = list.children[0];
const [name, amount] = row.children;
assert.equal(name.textContent, 'FERRITE');
assert.equal(amount.textContent, '10');
show([resource('ore-a', 'Ferrite', 10.2)], 10.2);
assert.strictEqual(list.children[0], row);
assert.equal(amount.writes, 1, 'unchanged rounded values must not mutate DOM');
assert.equal(total.writes, 2);
show([resource('ore-a', 'Ferrite', 11)], 11);
assert.strictEqual(list.children[0], row);
assert.equal(amount.textContent, '11');
assert.equal(amount.writes, 2);
assert.equal(name.writes, 1);
show([resource('ore-b', 'Sulfur', 2), resource('ore-a', 'Ferrite', 11)], 13);
assert.equal(list.children.length, 2);
assert.equal(list.children[0].children[0].textContent, 'SULFUR');
show([]);
assert.equal(list.children[0].textContent, 'LEER');
delete global.document;
console.log('PASS cargo DOM rows and rounded labels are reused until visible state changes');
