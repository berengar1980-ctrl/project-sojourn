'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { fieldCombatPose } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-field-combat-pose.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { localShipForwardSpeed, localShipVelocity } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-ship-velocity.ts'
);
const { createLocalSpaceService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-service.ts'
);
const { generateMiningSpace } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-generator.ts'
);
const { getShipDefinition } = loadStandaloneTypeScriptModule(root, 'src/systems/ships/index.ts');

const physicalVelocity = { x: -19, y: 44 };
const localShip = {
  position: { x: 720, y: 980 },
  headingRadians: Math.PI / 3,
  velocity: physicalVelocity,
  turnRateRadiansPerSecond: 0.31,
  angularThrust: -0.42,
  lateralThrust: 0.63,
};
assert.deepEqual(localShipVelocity(localShip), physicalVelocity);
assert.equal(
  localShipForwardSpeed(localShip),
  physicalVelocity.x * Math.cos(localShip.headingRadians) +
    physicalVelocity.y * Math.sin(localShip.headingRadians),
  'display speed is a signed projection of physical velocity'
);
const fieldPose = fieldCombatPose({
  ...localShip,
});
assert.deepEqual(fieldPose.velocity, physicalVelocity, 'field entry must preserve lateral drift');

const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-60m-variant-01',
  shieldHp: 100,
  hullHp: 100,
  weapons: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
});
const combat = createStrategicCombatService(setup('field-ship'), setup('opponent'), 73, {
  width: 4200,
  height: 2600,
  attackerPosition: fieldPose.position,
  attackerHeadingRadians: fieldPose.headingRadians,
  attackerVelocity: fieldPose.velocity,
  attackerManeuvering: fieldPose.maneuvering,
});
assert.deepEqual(
  combat.getSnapshot().attacker.velocity,
  physicalVelocity,
  'combat actor must start with the field owner’s complete velocity vector'
);
assert.equal(
  combat.getSnapshot().attacker.turnRateRadiansPerSecond,
  localShip.turnRateRadiansPerSecond
);
assert.equal(combat.getSnapshot().attacker.angularThrust, localShip.angularThrust);
assert.equal(combat.getSnapshot().attacker.lateralThrust, localShip.lateralThrust);

const returnedPose = combat.getSnapshot().attacker;
const expectedReturnedVelocity = { ...returnedPose.velocity };
const playerShip = getShipDefinition('miner-80m-variant-01');
const localSpace = createLocalSpaceService({
  instance: generateMiningSpace('handoff-test', 90210, [], 'sparse'),
  approachSpeed: 100,
  hardpoints: playerShip.sprite.hardpoints,
  nominalLengthMeters: playerShip.nominalLengthMeters,
});
localSpace.syncCombatPose(
  returnedPose.position,
  returnedPose.headingRadians,
  returnedPose.velocity,
  returnedPose
);
const restoredShip = localSpace.getSnapshot().instance.ship;
assert.deepEqual(restoredShip.velocity, expectedReturnedVelocity);
assert.equal(restoredShip.turnRateRadiansPerSecond, returnedPose.turnRateRadiansPerSecond);
assert.equal(restoredShip.angularThrust, returnedPose.angularThrust);
assert.equal(restoredShip.lateralThrust, returnedPose.lateralThrust);

console.log('PASS local combat handoff preserves physical and maneuvering state');
