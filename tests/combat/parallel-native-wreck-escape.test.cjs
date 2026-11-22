'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createParallelNativeDuels } = load('src/systems/combat/parallel-native-duels.ts');
const { nativeFleetVisibility } = load('src/ui/combat/combat-fleet-wreck-effects.ts');

function ship(id, team) {
  return {
    id,
    team,
    setup: {
      id,
      name: id,
      shipId: 'patrol-60m',
      shieldHp: 250,
      hullHp: 300,
      weapons: [],
      hitChance: 0.7,
      dodgeChance: 0.1,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 120,
      preferredTactic: 'fight',
    },
  };
}
function roster(a, b) {
  return [
    ...Array.from({ length: a }, (_, i) => ship('a-' + (i + 1), 'a')),
    ...Array.from({ length: b }, (_, i) => ship('b-' + (i + 1), 'b')),
  ];
}
function emptyArena() {
  return { width: 4200, height: 2600, obstacles: [], asteroids: [] };
}
function nearGate(actor, gate) {
  const cx = 2100;
  const cy = 1300;
  const dx = cx - gate.x;
  const dy = cy - gate.y;
  const d = Math.hypot(dx, dy);
  actor.position.x = gate.x + (dx / d) * 55;
  actor.position.y = gate.y + (dy / d) * 55;
  actor.tactic = 'flee';
  actor.combatTacticLocked = true;
}

const fleet = createParallelNativeDuels(roster(5, 5), emptyArena(), 881);
const marker = fleet.getSnapshot().duels[0].exitPoint;
assert(
  fleet
    .getSnapshot()
    .duels.every((duel) => duel.exitPoint.x === marker.x && duel.exitPoint.y === marker.y),
  'every 5v5 ship must fly to the same marker that the renderer displays'
);
const dead = fleet.duels[1].getParallelActor('defender');
dead.hullHp = 0;
fleet.tick(0.08);
const state = fleet.getSnapshot();
const wrecks = state.duels[0].arena.asteroids.filter((rock) => rock.id === 'fleet-wreck:b-2');
assert.equal(wrecks.length, 1, 'a destroyed ship turns into one persistent real wreck');
assert.equal(wrecks[0].kind, 'debris');
assert(wrecks[0].combatWreckVariant, 'the actual salvage wreck mesh is selected');
assert(wrecks[0].collisionRadius > 0, 'the wreck remains a physical obstacle');
assert(
  state.duels[1].arena.asteroids.includes(wrecks[0]),
  'all parallel duels must share one physical wreck rather than making duplicates'
);
const visibility = nativeFleetVisibility(
  state.duels[0],
  [...state.duels.slice(1), ...state.supporters],
  state.escapedShipIds
);
assert(
  visibility.damageHidden.has('b-2'),
  'the original dead ship no longer emits duplicate smoke'
);
for (let i = 0; i < 12; i++) fleet.tick(0.08);
assert.equal(
  fleet.getSnapshot().duels[0].arena.asteroids.filter((rock) => rock.id === 'fleet-wreck:b-2')
    .length,
  1,
  'a wreck persists and can never be generated twice after the original duel freezes'
);

// A distant fleeing vessel must make real physical progress to the shared gate.
const routeFleet = createParallelNativeDuels(roster(1, 1), emptyArena(), 515);
const routeShip = routeFleet.duels[0].getParallelActor('attacker');
const routeGate = routeFleet.getSnapshot().duels[0].exitPoint;
const startDistance = Math.hypot(
  routeShip.position.x - routeGate.x,
  routeShip.position.y - routeGate.y
);
routeShip.tactic = 'flee';
routeShip.combatTacticLocked = true;
for (let i = 0; i < 180; i++) routeFleet.tick(0.08);
const remainingDistance = Math.hypot(
  routeShip.position.x - routeGate.x,
  routeShip.position.y - routeGate.y
);
assert(
  remainingDistance < startDistance - 150 ||
    routeFleet.getSnapshot().escapedShipIds.includes('a-1'),
  'fleeing ships must actually fly toward the real shared exit rather than following a hidden gate'
);

const escaping = createParallelNativeDuels(roster(5, 5), emptyArena(), 44);
const escapeGate = escaping.getSnapshot().duels[0].exitPoint;
const fugitive = escaping.duels[3].getParallelActor('attacker');
nearGate(fugitive, escapeGate);
escaping.tick(0.08);
const escaped = escaping.getSnapshot();
assert(escaped.escapedShipIds.includes('a-4'), 'an escaped 5v5 ship leaves the shared world');
assert.equal(
  escaped.duels[3].winner,
  null,
  'remaining ship must immediately rejoin the fleet fight after its opponent flees'
);
assert(
  escaped.duels[3].defender.hullHp > 0,
  'the original surviving defender remains a real live combatant'
);
assert(
  nativeFleetVisibility(
    escaped.duels[0],
    escaped.duels.slice(1),
    escaped.escapedShipIds
  ).escaped.has('a-4'),
  'the existing native renderer must hide the escaped sprite'
);

const uneven = createParallelNativeDuels(roster(1, 5), emptyArena(), 58);
const gate = uneven.getSnapshot().duels[0].exitPoint;
nearGate(uneven.supporters[2].getParallelActor('attacker'), gate);
uneven.tick(0.08);
assert(
  uneven.getSnapshot().escapedShipIds.includes('b-4'),
  'support attackers must disappear after a successful escape without moving their target'
);
const overlay = fs.readFileSync(
  path.join(root, 'src/ui/combat/fleet-native-combat-renderer.ts'),
  'utf8'
);
const smoke = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-fleet-wreck-effects.ts'),
  'utf8'
);
assert(
  overlay.includes('fleetWreckEffects.draw('),
  'every combat map paints the real wreck effects'
);
assert(smoke.includes('new DistressDamageParticles()'), 'wrecks use real smoke and fire emitters');
console.log('PASS 5v5 physical wrecks, persistent fire, shared exit, 5v5 and 1v5 escape removal');
