'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/duel-lobby.ts'), 'utf8');
const routing = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-asteroid-routing.ts'),
  'utf8'
);

assert(lobby.includes("scenario?.id === 'alpha'"), 'analysis changes are Alpha-specific');
assert(lobby.includes('damageMultiplier: setup.damageMultiplier * 0.25'), 'Alpha damage reduced');
assert(lobby.includes('shieldHp: setup.shieldHp * 8'), 'Alpha shields increased');
assert(lobby.includes('drafts[index]!.mines = []'), 'Alpha does not open with lethal mines');
assert(
  routing.includes('const immediateThreat = pathBlocked('),
  'predict collision ahead of velocity'
);
assert(routing.includes('ship.nextAsteroidRouteAt = 0'), 'blocked waypoint triggers fresh routing');
console.log('PASS Alpha-specific analysis tuning and predictive waypoint replanning');
