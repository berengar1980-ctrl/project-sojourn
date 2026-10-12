'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const pilot = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-exchange-pilot.ts');
const collision = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-collision.ts'
);

const ship = (x, y, headingRadians = 0) => ({
  position: { x, y },
  velocity: { x: 0, y: 0 },
  headingRadians,
  speed: 0,
  shieldHp: 100,
  hullHp: 100,
  boostSeconds: 3.5,
  boostActive: false,
  setup: { combatSpeed: 120, accelerationMetersPerSecond2: 30, turnRateRadiansPerSecond: 1 },
  subsystems: { engine: 100 },
});

for (const [x1, x2] of [
  [500, 1400],
  [1400, 500],
]) {
  const first = ship(x1, 600, x1 < x2 ? 0 : Math.PI);
  const second = ship(x2, 600, x1 < x2 ? Math.PI : 0);
  const plan = pilot.planExchangeFlight(first, second, 'frontal_pass', 'close_gap', 'strong');
  const along = { x: Math.sign(x2 - x1), y: 0 };
  const side1 = (plan.initiatorGoal.y - first.position.y) * along.x;
  const side2 = (plan.reactorGoal.y - second.position.y) * along.x;
  assert.equal(side1, 0, 'frontal pass uses direct approach without forced flank offset');
  assert(side2 !== 0, 'reaction may use an avoidance corridor');
}
const boosted = ship(500, 500);
assert(pilot.activateExchangeBoost(boosted));
const order = {
  initiatorGoal: { x: 1600, y: 500 },
  reactorGoal: { x: 350, y: 500 },
  initiatorHeading: 0,
  reactorHeading: 0,
};
const arena = { width: 2200, height: 1300 };
const normal = ship(500, 500);
pilot.pilotExchangeShip(boosted, 'initiator', order, arena, 0.08);
pilot.pilotExchangeShip(normal, 'initiator', order, arena, 0.08);
const initialBonus = boosted.speed - normal.speed;
for (let i = 0; i < 20; i += 1) {
  pilot.pilotExchangeShip(boosted, 'initiator', order, arena, 0.08);
  pilot.pilotExchangeShip(normal, 'initiator', order, arena, 0.08);
}
assert(boosted.speed > normal.speed, 'boost increases longitudinal acceleration');
assert(boosted.boostRampSeconds > 1.5, 'boost ramps up over two seconds');
assert(initialBonus < boosted.speed - normal.speed, 'acceleration bonus builds progressively');

const collide = (closing) => {
  const first = ship(500, 500);
  const second = ship(580, 500, Math.PI);
  first.velocity.x = closing / 2;
  second.velocity.x = -closing / 2;
  const runtime = {
    attacker: first,
    defender: second,
    elapsedSeconds: 1,
    combatLog: [],
  };
  const damage = collision.applyActionRamImpact(runtime);
  assert.equal(
    collision.applyActionRamImpact(runtime),
    0,
    'contact cannot deal repeated damage each frame'
  );
  return damage;
};
assert(collide(12) < 1, 'slow contact inflicts minimal damage');
assert(collide(140) > collide(12) * 10, 'high-speed ramming scales with impact speed');
console.log('PASS frontal approach, reactive lane, boosted thrust ramp and velocity-based ram damage');
