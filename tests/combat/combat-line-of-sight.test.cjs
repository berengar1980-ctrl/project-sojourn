'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { hasClearCombatShot } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-line-of-sight.ts'
);
const source = { position: { x: 100, y: 100 }, headingRadians: 0, setup: { weaponMounts: [] } };
const target = { position: { x: 500, y: 100 }, shieldHp: 0 };
const rock = { id: 'blocking', position: { x: 300, y: 100 }, radius: 65 };
assert.equal(
  hasClearCombatShot(source, target, 0, { obstacles: [rock] }),
  false,
  'asteroid blocks line of fire'
);
rock.position.y = 300;
assert.equal(
  hasClearCombatShot(source, target, 0, { obstacles: [rock] }),
  true,
  'clear shot is allowed'
);
assert.equal(
  hasClearCombatShot(source, target, 0, { obstacles: [] }),
  true,
  'empty arena remains fireable'
);
console.log('PASS AI uses combat obstacle intersection for weapon firing');
