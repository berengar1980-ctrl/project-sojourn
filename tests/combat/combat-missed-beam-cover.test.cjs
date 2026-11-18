'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { firstObstacleHit } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const obstacle = { id: 'solid', position: { x: 200, y: 100 }, radius: 55 };
const from = { x: 30, y: 100 };
const missedShot = { x: 440, y: 100 };
const hit = firstObstacleHit(from, missedShot, [obstacle]);
assert(hit, 'a missed shot crossing a solid rock must collide with the rock');
assert(hit.point.x < obstacle.position.x, 'beam ends at first obstacle contact');

const weapons = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-weapons.ts'),
  'utf8'
);
assert(weapons.includes('const obstacle = firstObstacleHit('));
assert(
  !weapons.includes('const obstacle = hit\n    ? firstObstacleHit('),
  'missed instant weapons must test cover before drawing their beam'
);
console.log('PASS PvP and campaign missed lasers stop at solid asteroid cover');
