'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');
const weapon = (id) => {
  const found = SHIP_COMPONENT_CATALOG.weapon.find((entry) => entry.id === id);
  assert(found, id);
  return found;
};
function setup(id, type, gun, facing, speed) {
  return {
    id,
    name: id,
    shipId: type,
    shieldHp: 100000,
    hullHp: 100000,
    weapons: [weapon(gun)],
    weaponMounts: [{ slotIndex: 0, x: 0, y: 0, facing }],
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    aiControlled: true,
    aiAggression: 90,
    combatSpeed: speed,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
  };
}
const profiles = [
  ['patrol', 'patrol-60m-variant-01', 'weapon-railgun-1', 'forward', 150],
  ['freighter', 'freighter-120m-variant-01', 'weapon-autocannon-1', 'port', 85],
  ['miner', 'miner-80m-variant-01', 'weapon1', 'forward', 110],
  ['salvage', 'salvage-100m-variant-01', 'weapon-autocannon-1', 'starboard', 100],
];
function simulate(index, seed, flee = false, obstacles = [], dt = 0.08) {
  const a = setup(...profiles[index]);
  const b = setup(...profiles[(index + 1) % profiles.length]);
  const arena = {
    width: flee ? 20000 : 3600,
    height: 2600,
    attackerPosition: { x: flee ? 10000 : 1000, y: 1100 },
    defenderPosition: { x: flee ? 10800 : 2000, y: 1200 },
    exitPoint: { x: 120, y: 1100 },
    obstacles,
    ...(flee
      ? { obstacles: [{ id: 'enemy-side', position: { x: 10500, y: 1300 }, radius: 80 }] }
      : {}),
  };
  const combat = createStrategicCombatService(a, b, seed, arena);
  combat.setTactic('attacker', flee ? 'flee' : index === 2 ? 'kite' : 'fight');
  combat.setTactic('defender', 'fight');
  let state = combat.getSnapshot();
  const initialX = state.attacker.position.x;
  const metrics = {
    attacker: { travel: 0, shots: 0, idle: 0, maxIdle: 0, phases: 0 },
    defender: { travel: 0, shots: 0, idle: 0, maxIdle: 0, phases: 0 },
  };
  for (let tick = 0; tick < Math.round(60 / dt); tick += 1) {
    const next = combat.tick(dt);
    assert.equal(next.winner, null, 'durable fixtures must run the entire 60 seconds');
    collectMotion(metrics, state, next, dt);
    if (flee) assert.equal(next.attacker.tactic, 'flee');
    state = next;
  }
  assert(Math.abs(state.elapsedSeconds - 60) < 0.001);
  for (const side of ['attacker', 'defender']) {
    const metric = metrics[side];
    assert(
      metric.travel > 150,
      `${index}/${seed}/${side}: no useful movement ${JSON.stringify(metric)}`
    );
    assert(metric.maxIdle < 10, `${index}/${seed}/${side}: stuck ${JSON.stringify(metric)}`);
    if (!flee)
      assert(
        metric.shots >= 5,
        `${index}/${seed}/${side}: weapon starvation ${JSON.stringify(metric)}`
      );
    if (seed !== 1001)
      assert(
        metric.phases <= 20,
        `${index}/${seed}/${side}: phase churn ${JSON.stringify(metric)}`
      );
  }
  if (flee)
    assert(
      initialX - state.attacker.position.x > 2000,
      'escape must make sustained physical progress'
    );
  return { profile: a.id, seed, flee, ...metrics };
}
const reports = profiles.flatMap((_, index) => [
  simulate(index, 200 + index),
  simulate(index, 1001),
]);
reports.push(simulate(0, 304, true), simulate(1, 1001, true));
const rocks = [
  { id: 'center', position: { x: 1500, y: 1150 }, radius: 95 },
  { id: 'north', position: { x: 1900, y: 700 }, radius: 80 },
  { id: 'south', position: { x: 1150, y: 1600 }, radius: 100 },
];
reports.push(
  simulate(0, 410, false, rocks),
  simulate(1, 1001, false, rocks),
  simulate(2, 411, false, [], 0.04)
);
console.log(JSON.stringify(reports));
console.log(
  'PASS thirteen 60-second physical simulations: movement, shots, phases, stalls and escape'
);

function collectMotion(metrics, state, next, dt) {
  for (const side of ['attacker', 'defender']) {
    const ship = next[side];
    const before = state[side];
    const metric = metrics[side];
    const moved = Math.hypot(
      ship.position.x - before.position.x,
      ship.position.y - before.position.y
    );
    assert(Number.isFinite(moved) && Number.isFinite(ship.headingRadians));
    metric.travel += moved;
    const fired = ship.fireControl.lastShotAt > before.fireControl.lastShotAt;
    if (fired) metric.shots += 1;
    metric.idle = moved / dt < 5 && !fired ? metric.idle + dt : 0;
    metric.maxIdle = Math.max(metric.maxIdle, metric.idle);
    if (ship.strategy?.phase !== before.strategy?.phase) metric.phases += 1;
  }
}
