'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const { generateMiningSpace } = load('src/systems/local-space/local-space-generator.ts');
const { createLocalSpaceService } = load('src/systems/local-space/local-space-service.ts');
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const ship = getAllShipDefinitions()[0];
assert(ship);
const instance = generateMiningSpace('fleet-real-map-test', 173);
const scene = createLocalSpaceService({
  instance,
  approachSpeed: 80,
  hardpoints: ship.sprite.hardpoints,
  nominalLengthMeters: ship.nominalLengthMeters,
  systems: {
    shieldMaxHp: 100,
    shieldModifier: 1,
    hullMaxHp: 100,
    scanAvailable: true,
    sensorModifier: 1,
    sensorCrewSkill: 0,
    reactorOutput: 25,
    reactorContinuousUsed: 5,
  },
});
const originalAsteroids = instance.asteroids;
const firstAsteroid = { ...originalAsteroids[0].position };
const target = { x: instance.width * 0.33, y: instance.height * 0.48 };
scene.syncCombatPose(target, 0.42, 21);
scene.syncCombatIntegrity(31, 19);
const updated = scene.tickCombatEnvironment(0.08, true);
assert.equal(updated.instance, instance, 'existing local map is never regenerated');
assert.equal(updated.instance.asteroids, originalAsteroids, 'field bodies retain identity');
assert.deepEqual(
  updated.instance.asteroids[0].position,
  firstAsteroid,
  'local scene must not double-integrate asteroids under FleetCombat authority'
);
assert.deepEqual(updated.instance.ship.position, target, 'native-map player pose follows combat');
assert.equal(updated.instance.ship.headingRadians, 0.42);
assert.equal(updated.shield.currentHp, 31, 'combat damage transfers into original shield state');
assert.equal(updated.hull.currentHp, 19, 'combat damage transfers into original hull state');

// FleetCombat must not disable existing career-map navigation and must not
// integrate the same asteroid field a second time.
const origin = { ...scene.getSnapshot().instance.ship.position };
const destination = { x: origin.x + 450, y: origin.y + 100 };
scene.startNavigation(destination, [origin, destination]);
const asteroidBeforeFleetNavigation = { ...originalAsteroids[0].position };
for (let i = 0; i < 25; i += 1) {
  const live = scene.tickFleetNavigation(0.05);
  scene.syncFleetPose(
    live.instance.ship.position,
    live.instance.ship.headingRadians,
    live.instance.ship.speed
  );
}
const navigated = scene.getSnapshot();
assert(
  Math.hypot(
    navigated.instance.ship.position.x - origin.x,
    navigated.instance.ship.position.y - origin.y
  ) > 0,
  'native player autopilot must still move while FleetCombat owns the field'
);
assert(
  navigated.navigationTarget,
  'FleetCombat pose sync must not erase the active navigation route'
);
assert.deepEqual(
  originalAsteroids[0].position,
  asteroidBeforeFleetNavigation,
  'fleet navigation must never double-tick the live asteroid field'
);

const controller = read('src/app/game-controller.ts');
const sceneTick = read('src/app/game-controller-scene-tick.ts');
const map = read('src/ui/local-space/local-space-renderer.ts');
const fx = read('src/ui/local-space/local-space-npc-combat-effects.ts');
const entry = read('src/app/game-controller-fleet-integration.ts');
const bridge = read('src/app/game-controller-field-world-bridge.ts');
assert(controller.includes('advanceControllerFleetIntegration(context)'));
assert(controller.includes('targetControllerFleetShip(context, id)'));
assert(!map.includes('FleetCombatMapRenderer'), 'no duplicate fleet renderer');
assert(
  sceneTick.includes('hasControllerActiveFieldFleet(context)'),
  'local map must not integrate native asteroids twice while FleetCombat owns the field'
);
assert(
  map.includes('this.model.fleetCombat'),
  'existing LocalSpaceRenderer, not a replacement scene, must display FleetCombat'
);
assert(
  fx.includes('drawCombatBeamVisual(') && fx.includes('drawVisionProjectile('),
  'reuse native strategic combat weapon painters'
);
assert(entry.includes('beginControllerFieldFleet(context, locationId, [player])'));
assert(
  controller.includes('advanceControllerFleetIntegration(context, () => mountControllerStarMap(context))'),
  'FleetCombat defeat must return through the native campaign star-map transition'
);
assert(
  entry.includes('showFleetCombatResult(') &&
    entry.includes('context.state.combatReengageSeconds > 0') &&
    entry.includes('context.state.combatResultPending = true'),
  'player defeat must settle the field and prevent automatic reentry'
);
const summary = read('src/ui/combat/campaign-combat-summary.ts');
assert(
  summary.includes('export function showFleetCombatResult(') &&
    summary.includes("notice.className = 'campaign-combat-summary'"),
  'FleetCombat must reuse the existing campaign result display'
);
assert(bridge.includes('syncFleetFieldBodies(field, bodies)'));
assert(
  bridge.includes('context.state.localSpace.getShipWorldVelocity()'),
  'career handoff must transfer native player momentum into the shared combat arena'
);
assert(
  entry.includes('view.projectiles.length > 0') &&
    entry.includes('view.mines.length > 0') &&
    entry.includes('view.thrownAsteroids.length > 0'),
  'field ownership must survive the final pirate kill until live ordnance resolves'
);
for (const obsolete of [
  'src/ui/start/fleet-combat-test-panel.ts',
  'src/ui/start/fleet-combat-map-renderer.ts',
])
  assert(!fs.existsSync(path.join(root, obsolete)), 'no parallel FleetCombat map: ' + obsolete);
console.log(
  'PASS FleetCombat uses actual career field instance, existing map renderer and live ship HP'
);
