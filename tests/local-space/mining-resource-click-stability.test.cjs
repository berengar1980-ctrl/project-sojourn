'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');

// The actual selector only uses a small DOM subset. This fake preserves node
// identity, bubbling and delegated click targets without a browser dependency.
class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.classes = new Set();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.rebuilds = 0;
    this.listeners = new Map();
    this.classList = {
      toggle: (name, enabled) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.rebuilds += 1;
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
  matches(selector) {
    if (selector === '[data-resource-id]') return this.dataset.resourceId !== undefined;
    if (selector === '[data-all-resources]') return this.dataset.allResources !== undefined;
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
    return false;
  }
  closest(selector) {
    if (this.matches(selector)) return this;
    let candidate = this.parentElement;
    while (candidate) {
      if (candidate.matches(selector)) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }
  contains(node) {
    let candidate = node;
    while (candidate) {
      if (candidate === this) return true;
      candidate = candidate.parentElement;
    }
    return false;
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  click(target) {
    const listener = this.listeners.get('click');
    assert(listener, 'selector container needs one delegated click handler');
    listener({ target });
  }
}
class FakeButton extends FakeElement {
  constructor() {
    super('button');
  }
}
const originalElement = global.Element;
const originalButton = global.HTMLButtonElement;
const originalDocument = global.document;
global.Element = FakeElement;
global.HTMLButtonElement = FakeButton;
global.document = {
  createElement: (tag) => (tag === 'button' ? new FakeButton() : new FakeElement(tag)),
};

try {
  const { MiningResourceSelector } = loadStandaloneTypeScriptModule(
    root,
    'src/ui/local-space/mining-resource-selector.ts'
  );
  const container = new FakeElement();
  const selections = [];
  const selector = new MiningResourceSelector(container, (next) => selections.push(next));
  const deposits = ['one', 'two', 'three'].map((resourceId) => ({
    resourceId,
    resourceName: resourceId,
    estimatedAmount: 50,
  }));
  let model = {
    selectedAsteroid: { id: 'rock-1', scanLevel: 'analyzed', deposits },
    miningResourceSelection: null,
  };
  selector.update(model, false);
  assert.equal(container.rebuilds, 1);
  const first = container.querySelectorAll('[data-resource-id]')[0];
  const third = container.querySelectorAll('[data-resource-id]')[2];
  assert(first && third);

  // Simulate the many redraws which previously destroyed the pressed node
  // between pointerdown and pointerup, cancelling the user's click.
  for (let frame = 0; frame < 80; frame += 1) {
    selector.update(model, false);
    assert.equal(
      container.querySelectorAll('[data-resource-id]')[0],
      first,
      'every HUD refresh must preserve the original button identity'
    );
  }
  assert.equal(container.rebuilds, 1, 'same asteroid must not rebuild button DOM');
  container.click(first);
  assert.deepEqual(selections, [['one']], 'single click must select resource 1 immediately');

  model = { ...model, miningResourceSelection: selections.at(-1) };
  selector.update(model, false);
  container.click(third);
  assert.deepEqual(
    selections.at(-1),
    ['one', 'three'],
    'one further click must select 1+3 without touching resource 2'
  );
  assert.equal(container.rebuilds, 1);
  assert(first.classList.contains('is-active'));
  assert(third.classList.contains('is-active'));

  const all = container.querySelector('[data-all-resources]');
  container.click(all);
  assert.equal(selections.at(-1), null, 'ALLE remains a reliable one-click action');
  assert.equal(selections.length, 3, 'each user click produces exactly one callback');
  assert.equal(container.rebuilds, 1);

  selector.update(
    {
      ...model,
      selectedAsteroid: { ...model.selectedAsteroid, id: 'rock-2' },
      miningResourceSelection: null,
    },
    false
  );
  assert.equal(
    container.rebuilds,
    2,
    'the buttons only rebuild when switching to a different asteroid'
  );
  console.log('PASS stable one-click mining resource buttons across 80 HUD updates');
} finally {
  global.Element = originalElement;
  global.HTMLButtonElement = originalButton;
  global.document = originalDocument;
}
