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

assert(
  lobby.includes('setups[0]!') && lobby.includes('setups[1]!'),
  'free duel passes unmodified combat setups to the duel service'
);
assert(
  !lobby.includes('damageMultiplier: setup.damageMultiplier *'),
  'free duel damage uses normal value'
);
assert(!lobby.includes('shieldHp: setup.shieldHp *'), 'free duel shields use normal value');
assert(!lobby.includes('DUEL_ENCOUNTERS'), 'free duel has no curated encounter setup');
assert(
  routing.includes('const immediateThreat = pathBlocked('),
  'predict collision ahead of velocity'
);
assert(
  routing.includes('ship.nextAsteroidRouteAt = ROUTE_REFRESH_SECONDS'),
  'blocked paths respect a bounded route refresh interval'
);
console.log('PASS unmodified free duel setup and predictive waypoint replanning');
