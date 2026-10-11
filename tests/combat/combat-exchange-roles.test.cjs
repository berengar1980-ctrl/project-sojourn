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

console.log('PASS exchange initiator/reactor flight roles and damage-based initiative');
