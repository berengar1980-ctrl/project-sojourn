'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const pilot = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-exchange-pilot.ts');
const exchange = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-exchange-machine.ts'
);
const controllerSource = fs.readFileSync(
  path.join(root, 'src/systems/combat/combat-exchange-controller.ts'),
  'utf8'
);

assert.match(
  controllerSource,
  /pilotExchangeShip\(initiator, 'initiator', state\.flight, runtime\.arena, dt\)/,
  'actual initiative holder must receive initiator flight orders'
);
assert.match(
  controllerSource,
  /pilotExchangeShip\(opponent, 'reactor', state\.flight, runtime\.arena, dt\)/,
  'opponent must receive reaction flight orders'
);

function ship(x, y) {
  return {
    position: { x, y },
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    setup: {
      combatSpeed: 120,
      accelerationMetersPerSecond2: 30,
      turnRateRadiansPerSecond: 1,
    },
    subsystems: { engine: 100 },
  };
}

for (const initiative of ['attacker', 'defender']) {
  const attacker = ship(500, 500);
  const defender = ship(900, 500);
  const initiator = initiative === 'attacker' ? attacker : defender;
  const reactor = initiative === 'attacker' ? defender : attacker;
  const plan = pilot.planExchangeFlight(initiator, reactor, 'frontal_pass', 'evade', 'strong');

  const extend = pilot.planExchangeFlight(
    initiator,
    reactor,
    'broadside_pass',
    'extend_range',
    'strong'
  );
  const retreatVectorX = extend.reactorGoal.x - reactor.position.x;
  const retreatVectorY = extend.reactorGoal.y - reactor.position.y;
  assert(
    retreatVectorX * (reactor.position.x - initiator.position.x) +
      retreatVectorY * (reactor.position.y - initiator.position.y) >
      0,
    initiative + ': extend_range must move away from initiator'
  );

  assert.notDeepEqual(plan.initiatorGoal, plan.reactorGoal);
  const firstDistance = Math.hypot(
    plan.initiatorGoal.x - initiator.position.x,
    plan.initiatorGoal.y - initiator.position.y
  );
  const secondDistance = Math.hypot(
    plan.reactorGoal.x - reactor.position.x,
    plan.reactorGoal.y - reactor.position.y
  );

  pilot.pilotExchangeShip(initiator, 'initiator', plan, { width: 2000, height: 2000 }, 0.08);
  pilot.pilotExchangeShip(reactor, 'reactor', plan, { width: 2000, height: 2000 }, 0.08);

  assert(
    Math.hypot(
      plan.initiatorGoal.x - initiator.position.x,
      plan.initiatorGoal.y - initiator.position.y
    ) < firstDistance,
    initiative + ': initiator advances toward its own goal'
  );
  assert(
    Math.hypot(plan.reactorGoal.x - reactor.position.x, plan.reactorGoal.y - reactor.position.y) <
      secondDistance,
    initiative + ': reactor advances toward its own goal'
  );
}

const context = {
  frontWeapons: 1,
  broadsideWeapons: 0,
  guidedWeapons: 0,
  attackerDamage: 0,
  defenderDamage: 0,
  roll: () => 0.5,
};
for (const [attackerDamage, defenderDamage, expected] of [
  [20, 0, 'attacker'],
  [0, 20, 'defender'],
]) {
  const state = exchange.advanceExchange(
    exchange.advanceExchange(
      exchange.advanceExchange(exchange.initialExchange('attacker'), 0, context),
      20,
      context
    ),
    0,
    { ...context, attackerDamage, defenderDamage }
  );
  assert.equal(state.initiative, expected, 'initiative follows damage dealt, not damage received');
}

const strafeShip = ship(500, 500);
const strafePlan = {
  initiatorGoal: { x: 500, y: 900 },
  reactorGoal: { x: 1000, y: 500 },
  initiatorHeading: 0,
  reactorHeading: 0,
};
pilot.pilotExchangeShip(strafeShip, 'initiator', strafePlan, { width: 2000, height: 2000 }, 1);
assert(strafeShip.velocity.y > 0, 'RCS permits sideways course corrections');
assert(strafeShip.velocity.y <= 30, 'acceleration stays physically limited');
assert(strafeShip.headingRadians > 0, 'pilot turns toward flight goal before broadside firing');


// Different orders must not collapse into the same static flight goal.
for (const initiative of ['attacker', 'defender']) {
  const attacker = ship(550, 650);
  const defender = ship(1100, 650);
  const initiator = initiative === 'attacker' ? attacker : defender;
  const reactor = initiative === 'attacker' ? defender : attacker;
  const actions = ['frontal_pass', 'broadside_pass', 'disengage_fire', 'flanking_pass'];
  const goals = actions.map((action) =>
    pilot.planExchangeFlight(initiator, reactor, action, 'evade', 'strong').initiatorGoal
  );
  assert.equal(new Set(goals.map((goal) => goal.x + ':' + goal.y)).size, 4);
  const reactions = Object.values(exchange.REACTIONS).flat();
  const reactionGoals = reactions.map((reaction) => {
    const plan = pilot.planExchangeFlight(initiator, reactor, 'frontal_pass', reaction, 'strong');
    return [plan.reactorGoal.x, plan.reactorGoal.y, plan.reactorHeading].join(':');
  });
  assert.equal(new Set(reactionGoals).size, reactions.length, 'reactions must yield distinct flight or heading orders');
}


// Simulate committed orders without replanning: trajectories must diverge.
const trajectories = ['frontal_pass', 'broadside_pass', 'disengage_fire', 'flanking_pass'].map(
  (action) => {
    const initiator = ship(550, 650);
    const reactor = ship(1100, 650);
    const plan = pilot.planExchangeFlight(initiator, reactor, action, 'evade', 'strong');
    for (let step = 0; step < 120; step += 1) {
      pilot.pilotExchangeShip(initiator, 'initiator', plan, { width: 2400, height: 1600 }, 0.08);
    }
    return [Math.round(initiator.position.x), Math.round(initiator.position.y)].join(':');
  }
);
assert.equal(new Set(trajectories).size, 4, 'four actions need distinct simulated flight paths');

const approach = ship(500, 500);
const broadsideOrder = {
  initiatorGoal: { x: 1000, y: 500 },
  reactorGoal: { x: 300, y: 500 },
  initiatorHeading: Math.PI / 2,
  reactorHeading: Math.PI,
};
pilot.pilotExchangeShip(approach, 'initiator', broadsideOrder, { width: 2000, height: 2000 }, 1);
assert(Math.abs(approach.headingRadians) < 0.001, 'broadside approach uses main-drive heading first');
assert(approach.velocity.x > 0, 'broadside approach gains forward speed');

console.log('PASS exchange initiator/reactor flight roles and damage-based initiative');
