'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (filename) => loadStandaloneTypeScriptModule(root, filename);

const { createFleetDronePrototype } = load('src/ui/start/fleet-drone-prototype.ts');
const { createFleetCombatService } = load('src/systems/combat/fleet-combat-service.ts');

const arena = { width: 2000, height: 2000, obstacles: [], asteroids: [] };
const drone = createFleetDronePrototype(
  {
    id: 'drone-1',
    role: 'drone',
    team: 'security',
    name: 'SEC test',
    draft: null,
    spawnAtSeconds: 0,
    delaySeconds: 30,
  },
  1,
  arena,
  { x: 1100, y: 1000 }
);
assert.equal(drone.factionId, 'security');
assert(drone.setup.weapons.length > 0, 'career Mk-III drone must use real equipped weapons');
assert(drone.setup.weapons.some((component) => component.tier === 3));
assert(drone.setup.shieldHp > 0 && drone.setup.hullHp > 0);

function ship(id, weapons = []) {
  return {
    id, name: id, shipId: 'test-ship', shieldHp: 1000, hullHp: 1000, weapons,
    hitChance: 1, dodgeChance: 0, damageMultiplier: 1, criticalChance: 0,
    cycleTimeMultiplier: 1, combatSpeed: 80, preferredTactic: 'fight',
  };
}
const sim = createFleetCombatService(
  [
    { setup: ship('player'), factionId: 'player', position: { x: 200, y: 300 }, targetId: 'pirate' },
    { setup: ship('pirate'), factionId: 'pirate-a', position: { x: 1420, y: 1000 }, targetId: 'player' },
    drone,
  ],
  arena
);

let joined = false;
let moved = false;
let fired = false;
for (let step = 0; step < 160; step++) {
  const view = sim.tick(0.08);
  const current = view.ships.find((entry) => entry.ship.id === 'drone-1');
  assert(current);
  if (Math.hypot(current.ship.position.x - 1100, current.ship.position.y - 1000) > 30)
    moved = true;
  fired ||= view.shots.some((shot) => shot.sourceId === 'drone-1' && shot.targetId === 'pirate');
  if (view.engagements.some((fight) => fight.kind === 'fleet' && fight.memberIds.includes('drone-1')))
    joined = true;
}
assert(moved, 'drone should travel physically using campaign field routing');
assert(joined, 'drone must join the already-running player/pirate encounter');
assert(fired, 'drone should use its campaign Mk-III equipped weapons after joining');
console.log('PASS real campaign drone loadout, sensor intercept, physical join and active weapon fire');
