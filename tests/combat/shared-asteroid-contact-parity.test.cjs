'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

const { getShipDefinition } = load('src/systems/ships/index.ts');
const { shipShieldGeometry } = load('src/core/ship-contact-geometry.ts');
const { shipContactMassProperties } = load('src/core/ship-contact-mass.ts');
const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { resolveLocalWreckContacts } = load('src/systems/local-space/local-space-wreck-contacts.ts');
const { resolveCombatAsteroidContacts } = load('src/systems/combat/combat-asteroid-contacts.ts');
const { resolveContactImpulse } = load('src/core/contact-impulse.ts');

const definition = getShipDefinition('miner-80m-variant-01');
assert(definition);
const shield = shipShieldGeometry(definition);
const nominalLengthMeters = definition.nominalLengthMeters;
const mass = shipContactMassProperties(nominalLengthMeters, shield).mass;
const source = generateMiningSpace('shared-contact-parity', 127).asteroids.find(
  (body) => body.kind === 'resource'
);
assert(source);

function rockCopy(id) {
  return {
    ...source,
    id,
    position: { x: 500 + shield.radiusX + source.collisionRadius * 0.4, y: 500 },
    physics: { ...source.physics, velocity: { x: 0, y: 0 } },
    deposits: source.deposits.map((deposit) => ({ ...deposit })),
  };
}

const localRock = rockCopy('shared-rock');
const localShip = {
  position: { x: 500, y: 500 },
  velocity: { x: 5, y: 3 },
  headingRadians: 0,
  speed: 5,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
  longitudinalThrust: 0,
};
const localImpacts = resolveLocalWreckContacts(
  localShip,
  localShip.velocity,
  [],
  [localRock],
  shield,
  nominalLengthMeters
);

const combatRock = {
  ...rockCopy('shared-rock'),
  velocity: { x: 0, y: 0 },
};
const combatShip = {
  setup: {
    id: 'contact-test',
    shipId: definition.id,
    nominalLengthMeters,
    shieldGeometry: { ...shield, modifier: 1 },
  },
  position: { x: 500, y: 500 },
  velocity: { x: 5, y: 3 },
  headingRadians: 0,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  shieldHp: 100,
  shieldMaxHp: 100,
  hullHp: 100,
  shieldImpacts: [],
};
resolveCombatAsteroidContacts(combatShip, { asteroids: [combatRock] });

for (const [key, localValue, combatValue] of [
  ['ship x', localShip.position.x, combatShip.position.x],
  ['ship y', localShip.position.y, combatShip.position.y],
  ['ship vx', localShip.velocity.x, combatShip.velocity.x],
  ['ship vy', localShip.velocity.y, combatShip.velocity.y],
  ['rock x', localRock.position.x, combatRock.position.x],
  ['rock y', localRock.position.y, combatRock.position.y],
  ['rock vx', localRock.physics.velocity.x, combatRock.physics.velocity.x],
  ['rock vy', localRock.physics.velocity.y, combatRock.physics.velocity.y],
]) {
  assert(Math.abs(localValue - combatValue) < 1e-8, `${key} matches across campaign and combat`);
}
assert.equal(combatShip.shieldHp, 100, 'low-speed contact does not add combat damage');
const tangent = { x: -localImpacts[0].normal.y, y: localImpacts[0].normal.x };
assert(
  Math.abs(
    localShip.velocity.x * tangent.x +
      localShip.velocity.y * tangent.y -
      (5 * tangent.x + 3 * tangent.y)
  ) < 1e-8,
  'normal impulse preserves tangential velocity at the actual contour contact'
);

function rockSpeedAfterContact(rockMass) {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 8, y: 6 }, mass };
  const rock = { position: { x: 1, y: 0 }, velocity: { x: 0, y: 0 }, mass: rockMass };
  resolveContactImpulse(ship, rock, { x: 1, y: 0 }, 2);
  assert.equal(ship.velocity.y, 6, 'tangential velocity remains unchanged');
  assert.equal(rock.velocity.y, 0, 'normal contact does not invent tangent velocity');
  return rock.velocity.x;
}

assert(
  rockSpeedAfterContact(10) > rockSpeedAfterContact(100000),
  'lighter bodies receive more velocity from the same contact impulse'
);

console.log(
  'PASS campaign/combat asteroid contacts match with shared mass and tangent preservation'
);
