'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

class StubElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.hidden = false;
    this.style = {};
    this.clientWidth = 500;
    this.clientHeight = 340;
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  addEventListener(name, listener) {
    this.listeners.set(name, [...(this.listeners.get(name) || []), listener]);
  }

  removeEventListener(name, listener) {
    this.listeners.set(
      name,
      (this.listeners.get(name) || []).filter((candidate) => candidate !== listener)
    );
  }

  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) || []) listener(event);
  }

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 500, height: 340 };
  }

  setPointerCapture() {}
  focus() {
    this.focused = true;
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
  }
}

const documentBefore = global.document;
const windowBefore = global.window;
const doc = new StubElement('document');
const win = new StubElement('window');
doc.createElement = (tag) => new StubElement(tag);
global.document = doc;
global.window = win;

try {
  const root = path.resolve(__dirname, '../..');
  const { bindStarMapInput } = loadStandaloneTypeScriptModule(
    root,
    'src/ui/map/star-map-input.ts'
  );
  const shell = new StubElement('section');
  const canvas = new StubElement('canvas');
  shell.append(canvas);
  const selected = [];
  let contacts = [
    { kind: 'location', id: 'planet', name: 'Varras Prime', detail: 'PLANET' },
    { kind: 'npc', id: 'freighter', name: 'Quint Quell', detail: 'SCHIFF // FREIGHTER' },
  ];
  const events = [];
  const renderer = {
    pickContacts: () => contacts,
    pan: (dx, dy) => events.push(['pan', dx, dy]),
    zoomAt: () => events.push(['zoom']),
    resetCamera: () => events.push(['reset']),
    toggleHardpointDebug: () => events.push(['hardpoint']),
  };
  const unbind = bindStarMapInput({
    canvas,
    shell,
    renderer,
    onSelectNpc: (id) => selected.push('npc:' + id),
    onSelectLocation: (id) => selected.push('location:' + id),
  });
  const click = (x = 140, y = 150) => {
    const event = { clientX: x, clientY: y, pointerId: 1 };
    canvas.dispatch('pointerdown', event);
    canvas.dispatch('pointerup', event);
  };

  click();
  const picker = shell.children[1];
  assert.equal(picker.hidden, false, 'overlap must open a target picker');
  assert.equal(picker.children.length, 3, 'both the planet and ship must be selectable');
  assert.equal(picker.children[1].children[1].textContent, 'Varras Prime');
  assert.equal(picker.children[2].children[1].textContent, 'Quint Quell');
  assert.equal(selected.length, 0, 'overlap must not silently select the top sprite');

  picker.children[1].dispatch('click');
  assert.deepEqual(selected, ['location:planet']);
  assert.equal(picker.hidden, true);

  click();
  picker.children[2].dispatch('click');
  assert.deepEqual(selected, ['location:planet', 'npc:freighter']);

  contacts = [contacts[0]];
  click();
  assert.deepEqual(selected, ['location:planet', 'npc:freighter', 'location:planet']);
  assert.equal(picker.hidden, true, 'unambiguous picks select directly');

  contacts = [
    { kind: 'location', id: 'planet', name: 'Varras Prime', detail: 'PLANET' },
    { kind: 'npc', id: 'freighter', name: 'Quint Quell', detail: 'SCHIFF' },
  ];
  click();
  win.dispatch('keydown', { key: 'Escape', stopPropagation() {} });
  assert.equal(picker.hidden, true, 'escape dismisses the picker');

  click();
  canvas.dispatch('wheel', { preventDefault() {}, offsetX: 10, offsetY: 12, deltaY: -1 });
  assert.equal(picker.hidden, true, 'zoom dismisses stale overlap targets');

  click();
  canvas.dispatch('pointerdown', { clientX: 120, clientY: 130, pointerId: 1 });
  canvas.dispatch('pointermove', { clientX: 150, clientY: 155 });
  canvas.dispatch('pointerup', { clientX: 150, clientY: 155 });
  assert.equal(picker.hidden, true, 'panning does not reopen selection');
  assert(events.some(([name]) => name === 'pan'));

  unbind();
  assert.equal(shell.children.length, 1, 'picker must be removed on destroy');
  assert.equal(doc.listeners.get('pointerdown').length, 0);
  assert.equal(win.listeners.get('keydown').length, 0);
  console.log('PASS overlapping map target picker, direct selection, dismissals and cleanup');
} finally {
  global.document = documentBefore;
  global.window = windowBefore;
}
