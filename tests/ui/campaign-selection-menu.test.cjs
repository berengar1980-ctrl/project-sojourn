'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = new Map();
    this.textContent = '';
    this.className = '';
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.attributes = new Map();
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  append(...elements) {
    for (const element of elements) {
      element.parent = this;
      this.children.push(element);
    }
  }
  replaceChildren(...elements) {
    this.children = [];
    this.append(...elements);
  }
  addEventListener(name, callback) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
  }
  dispatch(name) {
    for (const callback of this.listeners.get(name) ?? []) callback();
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
  }
}
function descendants(node, tag) {
  return [
    ...(node.tagName === tag ? [node] : []),
    ...node.children.flatMap((entry) => descendants(entry, tag)),
  ];
}
const previous = global.document;
global.document = { createElement: (tag) => new Element(tag) };
try {
  const root = path.resolve(__dirname, '../..');
  const load = (p) => loadStandaloneTypeScriptModule(root, p);
  const { createCampaignSelection } = load('src/systems/campaigns/campaign-selection.ts');
  const { createCampaignSelectionMenu } = load('src/ui/start/campaign-selection-menu.ts');
  const { createStartMenu } = load('src/ui/start/start-menu.ts');
  const selections = createCampaignSelection([
    {
      id: 'story_a',
      title: 'Entwicklung A',
      version: 1,
      category: 'development',
      defaultEnabled: false,
    },
    {
      id: 'story_b',
      title: 'Frachtauftrag',
      version: 3,
      category: 'optional',
      description: 'Muster',
    },
    { id: 'core_a', title: 'Core', version: 1, category: 'core' },
  ]);
  const host = new Element('root');
  const actions = [];
  const menu = createStartMenu(host, (action) => actions.push(action));
  const buttons = descendants(host, 'button');
  assert.equal(buttons[2].textContent, 'Kampagnen');
  assert.equal(buttons[2].disabled, false, 'campaign manager must be enabled');
  buttons[2].dispatch('click');
  assert.deepEqual(actions, ['campaigns']);
  assert.equal(buttons[3].textContent, 'Karriere fortsetzen');
  assert.equal(buttons[3].disabled, true, 'without a valid Career save resume is disabled');
  menu.destroy();

  const resumed = createStartMenu(host, (action) => actions.push(action), true);
  const resumeButton = descendants(host, 'button')[3];
  assert.equal(resumeButton.disabled, false, 'saved Career can be continued');
  resumeButton.dispatch('click');
  assert.deepEqual(actions, ['campaigns', 'continue']);
  resumed.destroy();

  let backs = 0;
  let launches = 0;
  const select = createCampaignSelectionMenu(
    host,
    selections,
    () => backs++,
    () => launches++
  );
  const switches = descendants(host, 'input');
  assert.equal(switches.length, 3, 'render all packages from registry');
  assert.equal(switches[0].checked, false);
  assert.equal(switches[1].checked, true);
  assert.equal(switches[2].disabled, true, 'mandatory package cannot be unchecked');
  switches[0].checked = true;
  switches[0].dispatch('change');
  switches[1].checked = false;
  switches[1].dispatch('change');
  assert.deepEqual(selections.snapshot(), { story_a: true, story_b: false, core_a: true });
  const footer = descendants(host, 'button');
  footer[1].dispatch('click');
  footer[0].dispatch('click');
  assert.equal(backs, 1);
  assert.equal(launches, 1);
  select.destroy();
  const reopened = createCampaignSelectionMenu(
    host,
    selections,
    () => {},
    () => {}
  );
  const restored = descendants(host, 'input');
  assert.equal(restored[0].checked, true, 'menu reopening keeps the pending selection');
  assert.equal(restored[1].checked, false);
  reopened.destroy();
  console.log('PASS campaign menu: all packages, toggles, core lock and return navigation');
} finally {
  global.document = previous;
}
