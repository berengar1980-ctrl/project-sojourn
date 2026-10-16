'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

class StubElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.className = '';
    this.classList = {
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        if (enabled) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
      },
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  addEventListener(name, listener) {
    const existing = this.listeners.get(name) || [];
    this.listeners.set(name, [...existing, listener]);
  }

  removeEventListener(name, listener) {
    const existing = this.listeners.get(name) || [];
    this.listeners.set(name, existing.filter((item) => item !== listener));
  }

  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) || []) listener(event);
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
  }
}

const previousDocument = global.document;
const previousWindow = global.window;
const documentStub = new StubElement('document');
documentStub.createElement = (tag) => new StubElement(tag);
documentStub.createElementNS = (_, tag) => new StubElement(tag);
const windowStub = new StubElement('window');

global.document = documentStub;
global.window = windowStub;

try {
  const root = path.resolve(__dirname, '../..');
  const { createStarMapMenu } = loadStandaloneTypeScriptModule(root, 'src/ui/map/star-map-menu.ts');
  const host = new StubElement('section');
  const sections = [];
  const menu = createStarMapMenu(host, (section) => sections.push(section));
  const shell = host.children[0];
  const [drawer, toolbar] = shell.children;
  assert.equal(menu.activeSection(), null);
  assert.equal(drawer.hidden, true);
  assert.equal(toolbar.children.length, 5);
  assert.equal(menu.tradePane.hidden, true);

  toolbar.children[1].dispatch('click');
  assert.equal(menu.activeSection(), 'trade');
  assert.equal(menu.tradePane.hidden, false);
  assert.equal(toolbar.children[1].getAttribute('aria-expanded'), 'true');

  toolbar.children[1].dispatch('click');
  assert.equal(menu.activeSection(), null);
  assert.equal(drawer.hidden, true);

  toolbar.children[2].dispatch('click');
  windowStub.dispatch('keydown', { key: 'Escape', stopPropagation() {} });
  assert.equal(menu.activeSection(), null);

  toolbar.children[4].dispatch('click');
  documentStub.dispatch('pointerdown', { target: host });
  assert.equal(menu.activeSection(), null);

  assert.deepEqual(sections, ['trade', null, 'contacts', null, 'system', null]);
  menu.destroy();
  assert.equal(host.children.length, 0);
  assert.equal(documentStub.listeners.get('pointerdown').length, 0);
  assert.equal(windowStub.listeners.get('keydown').length, 0);
  console.log('PASS star map menu runtime open/close, outside click, escape and cleanup');
} finally {
  global.document = previousDocument;
  global.window = previousWindow;
}
