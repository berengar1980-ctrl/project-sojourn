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

assert(
  controllerSource.includes('const initiativeSide = next.initiative;'),
  'runtime initiative is authoritative'
);
assert(
  controllerSource.includes(
    "const opposingSide = initiativeSide === 'attacker' ? 'defender' : 'attacker';"
  ),
  'opposing side keeps the reactor role'
);
assert(
  /initiatorGoal:\\s*initiatorOverride\\s*\\?\\?\\s*coverGoal\\(initiator, opponent, runtime\\.arena\\)\\s*\\?\\?\\s*state\\.flight\\.initiatorGoal/.test(
    controllerSource
  ),
  'reactive initiator goal keeps its own lane'
);
assert(
  /reactorGoal:\\s*opponentOverride\\s*\\?\\?\\s*coverGoal\\(opponent, initiator, runtime\\.arena\\)\\s*\\?\\?\\s*state\\.flight\\.reactorGoal/.test(
    controllerSource
  ),
  'reactive reactor goal keeps its own lane'
);
assert.match(
  controllerSource,
  /pilotExchangeShip\(\s*initiator,\s*'initiator',\s*flight,\s*runtime\.arena,\s*dt,/,
  'initiative holder receives initiator flight orders'
);
assert(
  /pilotExchangeShip\(\s*opponent,\s*'reactor',\s*flight,\s*runtime\.arena,\s*dt,\s*initiator,\s*false,\s*next\.reaction === 'turn_to_face'\s*\)/.test(
    controllerSource
  ),
  'opposing ship receives reactor flight orders'
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
assert(
  Math.hypot(strafeShip.velocity.x, strafeShip.velocity.y) <= 30 + 1e-8,
  'combined main thrust and RCS impulse respects total acceleration budget'
);
assert(strafeShip.headingRadians > 0, 'pilot turns toward flight goal before broadside firing');

// Different orders must not collapse into the same static flight goal.
for (const initiative of ['attacker', 'defender']) {
  const attacker = ship(550, 650);
  const defender = ship(1100, 650);
  const initiator = initiative === 'attacker' ? attacker : defender;
  const reactor = initiative === 'attacker' ? defender : attacker;
  const actions = ['frontal_pass', 'broadside_pass', 'disengage_fire', 'flanking_pass'];
  const goals = actions.map(
    (action) =>
      pilot.planExchangeFlight(initiator, reactor, action, 'evade', 'strong').initiatorGoal
  );
  assert.equal(new Set(goals.map((goal) => goal.x + ':' + goal.y)).size, 4);
  const reactions = Object.values(exchange.REACTIONS).flat();
  const reactionGoals = reactions.map((reaction) => {
    const plan = pilot.planExchangeFlight(initiator, reactor, 'frontal_pass', reaction, 'strong');
    return [plan.reactorGoal.x, plan.reactorGoal.y, plan.reactorHeading].join(':');
  });
  assert.equal(
    new Set(reactionGoals).size,
    reactions.length,
    'reactions must yield distinct flight or heading orders'
  );
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
assert(
  Math.abs(approach.headingRadians) < 0.001,
  'broadside approach uses main-drive heading first'
);
assert(approach.velocity.x > 0, 'broadside approach gains forward speed');

// Reloading a weapon must not alter a committed flight maneuver.
// The flight pilot deliberately has no dependency on weapon cooldowns.
function simulateCooldown(cooldownSeconds) {
  const vessel = ship(500, 500);
  vessel.cooldowns = [cooldownSeconds];
  const order = {
    initiatorGoal: { x: 1100, y: 620 },
    reactorGoal: { x: 400, y: 500 },
    initiatorHeading: Math.PI / 2,
    reactorHeading: 0,
  };
  for (let step = 0; step < 80; step += 1) {
    vessel.cooldowns[0] = Math.max(0, vessel.cooldowns[0] - 0.08);
    pilot.pilotExchangeShip(vessel, 'initiator', order, { width: 2400, height: 1600 }, 0.08);
  }
  return {
    position: vessel.position,
    velocity: vessel.velocity,
    headingRadians: vessel.headingRadians,
  };
}
assert.deepEqual(
  simulateCooldown(5),
  simulateCooldown(0),
  'railgun reload must never trigger turns or change a committed flight path'
);

const boostShip = ship(500, 500);
boostShip.boostSeconds = 3.5;
assert.equal(pilot.activateExchangeBoost(boostShip), true, 'boost can be activated');
const boostOrder = {
  initiatorGoal: { x: 1700, y: 500 },
  reactorGoal: { x: 400, y: 500 },
  initiatorHeading: 0,
  reactorHeading: 0,
};
const normalShip = ship(500, 500);
for (let i = 0; i < 20; i += 1) {
  pilot.pilotExchangeShip(boostShip, 'initiator', boostOrder, { width: 2200, height: 1400 }, 0.08);
  pilot.pilotExchangeShip(normalShip, 'initiator', boostOrder, { width: 2200, height: 1400 }, 0.08);
}
assert(boostShip.speed > normalShip.speed, 'boost increases speed');
pilot.stopExchangeBoost(boostShip);
const saved = boostShip.boostSeconds;
pilot.updateExchangeBoost(boostShip, 1);
assert(boostShip.boostSeconds > saved, 'charge regenerates when no longer boosting');
boostShip.boostSeconds = 0.4;
pilot.stopExchangeBoost(boostShip);
pilot.updateExchangeBoost(boostShip, 1);
const firstThirdGain = boostShip.boostSeconds - 0.4;
boostShip.boostSeconds = 1.5;
pilot.updateExchangeBoost(boostShip, 1);
const middleThirdGain = boostShip.boostSeconds - 1.5;
boostShip.boostSeconds = 2.7;
pilot.updateExchangeBoost(boostShip, 1);
const lastThirdGain = boostShip.boostSeconds - 2.7;
assert(
  firstThirdGain < middleThirdGain && middleThirdGain < lastThirdGain,
  'recharge increases in each third'
);
boostShip.boostSeconds = 0;
pilot.stopExchangeBoost(boostShip);
pilot.updateExchangeBoost(boostShip, 14);
assert(Math.abs(boostShip.boostSeconds - 3.5) < 0.0001, 'empty boost replenishes in 14 seconds');

const escapeShip = ship(500, 500);
escapeShip.tactic = 'flee';
const escapeGoal = { x: 300, y: 900 };
const escapePlan = {
  initiatorGoal: { x: 1700, y: 500 },
  reactorGoal: { x: 1700, y: 500 },
  initiatorHeading: 0,
  reactorHeading: Math.PI,
};
pilot.pilotExchangeShip(
  escapeShip,
  'initiator',
  escapePlan,
  {
    width: 2200,
    height: 1400,
    exitPoint: escapeGoal,
  },
  0.08
);
assert(escapeShip.velocity.y > 0, 'escaping ship navigates toward exit instead of combat waypoint');

console.log('PASS exchange initiator/reactor flight roles and damage-based initiative');
