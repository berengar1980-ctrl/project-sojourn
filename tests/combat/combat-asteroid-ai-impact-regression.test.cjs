'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const movement = read('src/systems/combat/strategic-combat-movement.ts');
const steering = read('src/systems/combat/combat-route-steering.ts');
const routing = read('src/systems/combat/combat-asteroid-routing.ts');
const physics = read('src/systems/combat/combat-asteroid-contacts.ts');
const renderer = read('src/ui/combat/combat-hull-impact-renderer.ts');
const weapons = read('src/systems/combat/strategic-combat-weapons.ts');

assert(
  movement.includes('steerCombatRoute(') &&
    steering.includes('combatRouteHeading(combatant, destination') &&
    steering.includes('return enemy.position;'),
  'autonomous movement routes through obstacle navigation'
);
assert(
  steering.includes('asteroidCoverHeading(combatant, enemy, arena)'),
  'cover and asteroid avoidance remain part of the canonical pilot'
);
assert(routing.includes('pathBlocked('), 'direct line checks asteroid clearance');
assert(physics.includes('resistance'), 'large rocks resist ship-contact displacement');
assert(renderer.includes("impact.layer === 'obstacle'"), 'obstacle impacts have a visual effect');
assert(
  renderer.includes("impact.weaponKind === 'missile'"),
  'missile impact has specific visual treatment'
);
assert(
  renderer.includes("impact.weaponKind === 'rail'"),
  'rail impact has specific visual treatment'
);
assert(
  weapons.includes('noteRuntimeImpact(runtime'),
  'weapon collisions emit impact notifications'
);
console.log('PASS unified asteroid route and existing impact rendering guards');
