'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const filename = path.join(root, 'src/app/game-controller-combat-resolution.ts');
const originalPerformance = globalThis.performance;
let simulatedMilliseconds = 1000;
globalThis.performance = { now: () => simulatedMilliseconds };

function loadResolver(mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const execute = new vm.Script('(function(exports, require) {' + code + '\n})').runInThisContext();
  execute(
    exports,
    (request) =>
      mocks[request] ??
      loadStandaloneTypeScriptModule(
        root,
        path.relative(root, path.resolve(path.dirname(filename), request + '.ts'))
      )
  );
  return exports;
}

function scenario(origin, boarding = false) {
  const calls = [];
  let returnFromBoarding;
  let dismissSummary;
  const field = {
    id: 'existing-wreck-field',
    sourceLocationId: 'field',
    wrecks: [{ id: 'wreck', remaining: 17 }],
  };
  const snapshot = {
    winner: 'attacker',
    boardingInitiator: boarding ? 'attacker' : null,
    elapsedSeconds: 12,
    lastEvent: 'battle ended',
    outcomeReason: 'destruction',
    attacker: {
      id: 'player',
      hullHp: 72,
      hullMaxHp: 100,
      position: { x: 12, y: 34 },
      headingRadians: 1,
      speed: 2,
    },
    defender: {
      id: 'miner',
      name: 'Miner',
      hullHp: 0,
      position: { x: 56, y: 78 },
      headingRadians: 2,
      speed: 3,
    },
  };
  let combat = { getSnapshot: () => snapshot };
  const context = {
    root: {},
    state: {
      mode: origin,
      embeddedCombat: origin,
      localSpace: {
        getSnapshot: () => ({ instance: { sourceLocationId: 'field' } }),
        syncCombatPose: (...args) => calls.push(['player-pose', ...args]),
      },
      localNpcMining: { syncCombatPose: (...args) => calls.push(['npc-pose', ...args]) },
      salvageScene: {
        getField: () => field,
        finishCombat: (result) => calls.push(['salvage-finish', result]),
      },
    },
    economy: { localPirates: new Map() },
    engagements: {
      activePlayerCombat: () => combat,
      finishPlayerCombat: () => {
        calls.push(['finish']);
        combat = null;
      },
    },
    campaignEvents: { emit: (event) => calls.push(['event', event]) },
    systemLog: { write: () => {} },
  };
  // Replace scene/UI boundaries; execute the production combat resolver and event emitter.
  const mocks = {
    './game-controller-combat-wrecks': {
      recordCareerCombatWrecks: (_, result, id) => {
        calls.push(['wrecks', id]);
        return [];
      },
    },
    './game-controller-combat-scene': { mountCombatScene: () => calls.push(['mount-combat']) },
    './game-controller-ship-service': {
      recordPlayerCombatHull: (_, result) => calls.push(['hull', result.attacker.hullHp]),
    },
    './game-controller-combat-boarding': {
      startCombatBoarding: (_, result, done) => {
        calls.push(['boarding', result]);
        context.state.mode = 'boarding';
        context.state.embeddedCombat = null;
        returnFromBoarding = done;
      },
    },
    '../ui/combat/campaign-combat-summary': {
      showCampaignCombatSummary: (_, result, done) => {
        calls.push(['summary', result]);
        dismissSummary = done;
      },
    },
  };
  const exports = loadResolver(mocks);
  const scenes = Object.fromEntries(
    ['starMap', 'mining', 'salvage'].map((name) => [name, (...args) => calls.push([name, ...args])])
  );
  const resolve = () => exports.resolveControllerCombat(context, scenes);
  return {
    context,
    calls,
    field,
    snapshot,
    resolve,
    board: (outcome) => returnFromBoarding(outcome),
    dismiss: () => dismissSummary(),
  };
}

for (const origin of ['local-space', 'salvage-space']) {
  const s = scenario(origin);
  s.resolve();
  assert.equal(
    s.calls.filter(([name]) => name === 'finish').length,
    0,
    'explosion must stay visible'
  );
  simulatedMilliseconds += 2201;
  s.resolve();
  assert.equal(s.calls.filter(([name]) => name === 'finish').length, 1);
  assert.equal(s.calls.filter(([name]) => name === 'summary').length, 1);
  assert.deepEqual(
    s.calls.filter(([name]) => name === 'event'),
    [
      [
        'event',
        {
          type: 'combat.ended',
          attackerId: 'player',
          defenderId: 'miner',
          winner: 'attacker',
          outcomeReason: 'destruction',
        },
      ],
    ]
  );
  assert.equal(s.context.state.embeddedCombat, null);
  assert(s.calls.some(([name, hp]) => name === 'hull' && hp === 72));
  if (origin === 'local-space') {
    assert.deepEqual(
      s.calls.find(([name]) => name === 'player-pose'),
      ['player-pose', s.snapshot.attacker.position, 1, 2]
    );
    assert.deepEqual(
      s.calls.find(([name]) => name === 'npc-pose'),
      ['npc-pose', 'miner', s.snapshot.defender.position, 2, 3]
    );
  } else assert.equal(s.calls.find(([name]) => name === 'salvage-finish')[1], s.snapshot);
}

for (const origin of ['local-space', 'salvage-space']) {
  for (const outcome of ['player_win', 'enemy_win']) {
    const s = scenario(origin, true);
    const localSpace = s.context.state.localSpace;
    const localNpcs = s.context.state.localNpcMining;
    s.resolve();
    s.resolve();
    assert.equal(s.calls.filter(([name]) => name === 'boarding').length, 1);
    assert(!s.calls.some(([name]) => ['mount-combat', 'finish', 'event'].includes(name)));
    assert.equal(s.context.state.localSpace, localSpace);
    assert.equal(s.context.state.localNpcMining, localNpcs);
    s.board(outcome);
    if (outcome === 'enemy_win') assert.deepEqual(s.calls.at(-1), ['starMap']);
    else if (origin === 'local-space') assert.deepEqual(s.calls.at(-1), ['mining', true, true]);
    else {
      assert.deepEqual(s.calls.at(-1), ['salvage', true, s.field, s.snapshot]);
      assert.equal(s.calls.at(-1)[2], s.field, 'return uses the existing wreck field');
    }
  }
}

const defeat = scenario('salvage-space');
defeat.snapshot.attacker.hullHp = 0;
defeat.resolve();
assert.equal(defeat.calls.filter(([name]) => name === 'finish').length, 0);
simulatedMilliseconds += 2201;
defeat.resolve();
defeat.dismiss();
assert.deepEqual(defeat.calls.at(-1), ['starMap']);
globalThis.performance = originalPerformance;
console.log('PASS combat events, explosion grace, boarding continuity and defeat return');
