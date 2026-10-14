'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { campaignCombatResult, combatResultMessage } = loadStandaloneTypeScriptModule(
  root,
  'src/app/combat-result-summary.ts'
);
const snapshot = {
  winner: 'attacker',
  boardingInitiator: null,
  elapsedSeconds: 43.9,
  attacker: { hullHp: 72.8, hullMaxHp: 120 },
  defender: { name: 'Raider', hullHp: 0, hullMaxHp: 100 },
};
const result = campaignCombatResult(snapshot);
assert.equal(result.outcome, 'SIEG');
assert.equal(result.playerHull, 73);
assert.equal(result.duration, 44);
assert.equal(result.boarding, false);
assert(combatResultMessage(snapshot).includes('HÜLLE 73/120'));
assert.equal(campaignCombatResult({ ...snapshot, winner: 'defender' }).outcome, 'NIEDERLAGE');
assert.equal(campaignCombatResult({ ...snapshot, boardingInitiator: 'attacker' }).boarding, true);

const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const controller = source('src/app/game-controller.ts');
const boarding = source('src/app/game-controller-combat-boarding.ts');
const salvage = source('src/app/game-controller-salvage.ts');
assert(
  controller.includes('mountControllerMining(context, true, true)'),
  'boarding returns to existing mining instance'
);
assert(controller.includes('preservedSalvageField'), 'salvage boarding keeps existing wreck state');
assert(
  controller.includes('state.salvageScene?.finishCombat(finalCombat)'),
  'salvage return restores last combat pose'
);
assert(
  !boarding.includes('state.localSpace = null'),
  'boarding must retain current mining simulation'
);
assert(
  !boarding.includes('state.localNpcMining = null'),
  'boarding must retain local NPC simulation'
);
assert(
  boarding.includes('context.engagements.finishPlayerCombat();'),
  'resolve active space combat on boarding finish'
);
assert(boarding.includes('showCampaignCombatSummary'), 'show boarding result before scene return');
assert(
  salvage.includes('getField(): SalvageField'),
  'salvage scene exposes live field for restoration'
);
assert(controller.includes('showCampaignCombatSummary'), 'embedded fights show outcome summary');
assert(
  controller.includes("state.mode !== 'boarding'"),
  'ongoing boarding must not remount space combat'
);
console.log('PASS campaign combat results, boarding scene continuity and outcome presentation');
