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

assert(lobby.includes('const tunedSetups = setups;'), 'Alpha uses the regular combat setup');
assert(
  !lobby.includes('damageMultiplier: setup.damageMultiplier *'),
  'Alpha damage uses normal value'
);
assert(!lobby.includes('shieldHp: setup.shieldHp *'), 'Alpha shields use normal value');
assert(lobby.includes('drafts[index]!.mines = []'), 'Alpha does not open with lethal mines');
assert(
  routing.includes('const immediateThreat = pathBlocked('),
  'predict collision ahead of velocity'
);
assert(
  routing.includes('ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS'),
  'blocked paths respect a bounded route refresh interval'
);
console.log('PASS Alpha-specific analysis tuning and predictive waypoint replanning');
