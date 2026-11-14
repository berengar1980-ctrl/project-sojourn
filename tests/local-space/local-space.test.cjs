'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const generator = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-generator.ts'),
  'utf8'
);
const service = readModuleSource(root, 'src/systems/local-space/local-space-service.ts');
const navigation = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-navigation.ts'),
  'utf8'
);
const routeWorkerClient = readModuleSource(
  root,
  'src/systems/local-space/local-space-route-worker-client.ts'
);
const routeWorker = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-route-worker.ts'),
  'utf8'
);
const collision = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-collision.ts'),
  'utf8'
);
const physics = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-physics.ts'),
  'utf8'
);
const miningImpact = fs.readFileSync(
  path.join(root, 'src/systems/local-space/mining-impact.ts'),
  'utf8'
);
const stationKeeping = readModuleSource(
  root,
  'src/systems/local-space/local-space-station-keeping.ts'
);
const controller = readModuleSource(root, 'src/app/game-controller.ts');
const starController = readModuleSource(root, 'src/app/game-controller-star-map.ts');
const localActions = readModuleSource(root, 'src/app/game-controller-local-actions.ts');
const miningController = readModuleSource(root, 'src/app/game-controller-mining.ts');
const shieldService = fs.readFileSync(
  path.join(root, 'src/systems/shields/shield-service.ts'),
  'utf8'
);
const shieldTypes = fs.readFileSync(path.join(root, 'src/core/shield-types.ts'), 'utf8');
const resources = fs.readFileSync(
  path.join(root, 'src/data/resources/mining-resources.ts'),
  'utf8'
);
const scanner = fs.readFileSync(path.join(root, 'src/systems/scanning/scanner-service.ts'), 'utf8');
const localScanning = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-scanning.ts'),
  'utf8'
);
const scanClock = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-scan-clock.ts'),
  'utf8'
);
const shipSystems = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-ship-systems.ts'),
  'utf8'
);
const miningChunks = fs.readFileSync(
  path.join(root, 'src/systems/local-space/mining-chunk-service.ts'),
  'utf8'
);
const miningResourceRuntime = readModuleSource(
  root,
  'src/systems/local-space/mining-resource-runtime.ts'
);
const miningEvents = fs.readFileSync(
  path.join(root, 'src/systems/local-space/mining-event-service.ts'),
  'utf8'
);
const miningFormation = readModuleSource(
  root,
  'src/systems/local-space/local-space-mining-formation.ts'
);
const autopilot = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-autopilot.ts'),
  'utf8'
);

assert(generator.includes('seed'), 'local-space generator must be seed-driven');
assert(
  generator.includes('pickMiningResource'),
  'asteroid deposits must be selected from the resource catalog'
);
assert(
  generator.includes("scanLevel: 'unscanned'"),
  'resource asteroids must start with hidden scan data'
);
assert(
  generator.includes('if (random() >= 0.68) return []'),
  'some generated asteroids must be empty'
);
assert(
  generator.includes('depositCount') && generator.includes('usedResourceIds'),
  'resource asteroids must support multiple unique ore deposits'
);
assert(
  (resources.match(/id: '/g) ?? []).length === 13,
  'mining catalog must cover all thirteen raw sector resources'
);
assert(
  resources.includes("id: 'carbon'") &&
    resources.includes("id: 'sulfur'") &&
    resources.includes("id: 'rare-metals'"),
  'mining catalog must include non-ore raw materials used by the economy'
);
assert(resources.includes('rarity:'), 'resources must define rarity factors');
assert(resources.includes('spawnWeight:'), 'rarity data must influence discovery weights');
assert(
  resources.includes('resourceReferenceValue'),
  'resource rarity must contribute to reference value calculation'
);
assert(
  scanner.includes('sensorModifier') && scanner.includes('crewSkill'),
  'long-range scanner radius must be ready for sensors and crew skill'
);
assert(
  generator.includes('const width = 4400'),
  'mining field width must use the compact density-preserving size'
);
assert(
  generator.includes('const height = 2570'),
  'mining field height must use the compact density-preserving size'
);
assert(
  generator.includes('createResourceAsteroids'),
  'local-space generator must create resource asteroids'
);
assert(generator.includes('createDebris'), 'local-space generator must create small debris');
assert(
  generator.includes('const count = 64 + Math.floor(random() * 17)'),
  'resource asteroid count must be reduced by about one third'
);
assert(
  generator.includes('const count = 127 + Math.floor(random() * 34)'),
  'small debris count must be reduced by about one third'
);
assert(
  generator.includes('createPhysics(radius, random, 5.8, 0.1, 1.9)'),
  'resource asteroids must have slightly stronger drift'
);
assert(
  generator.includes('createPhysics(radius, random, 16.5, 0.36, 1.15)'),
  'debris must remain more mobile than resource asteroids'
);
assert(generator.includes("kind: 'debris'"), 'small debris kind must be explicit');
assert(generator.includes('routeBlocking: false'), 'debris must not block route planning');
assert(generator.includes('centerOfMassOffset'), 'asteroids must define a center of mass');
assert(generator.includes('angularVelocity'), 'asteroids must receive angular motion');
assert(generator.includes('momentOfInertia'), 'asteroids must define rotational inertia');
assert(service.includes('startMining'), 'local-space service must expose mining start');
assert(
  service.includes('startNavigation'),
  'local-space service must expose manual point navigation'
);
assert(
  service.includes('getPointRouteOptions'),
  'manual navigation must reuse route-planning input'
);
assert(service.includes('cancelMining'), 'local-space service must expose mining cancellation');
assert(service.includes('startLongRangeScan'), 'service must expose timed long-range scanning');
assert(
  service.includes('this.scanClock.longProgress()') && scanClock.includes('this.longElapsed / 5'),
  'long-range scan must expose five-second progress'
);
assert(
  service.includes('this.scanClock.advanceLong(clamped)') &&
    scanClock.includes('this.longElapsed < 5'),
  'long-range scan must not finish before five seconds'
);
assert(service.includes('startShortRangeScan'), 'service must expose close asteroid analysis');
assert(
  service.includes("this.miningPhase === 'scanning'") &&
    scanClock.includes('this.shortElapsed / 5'),
  'close-range scan must expose a dedicated five-second scanning phase'
);
assert(
  service.includes('this.scanClock.advanceShort(') && scanClock.includes('this.shortElapsed < 5'),
  'close-range scan must not reveal asteroid contents before five seconds'
);
assert(
  localScanning.includes("asteroid.scanLevel = 'surveyed'"),
  'long-range scan must reveal only deposit presence'
);
const miningApproachSection = service.slice(
  service.indexOf('private finishApproachFacing'),
  service.indexOf('private updateShortRangeScan')
);
assert(
  !miningApproachSection.includes("asteroid.scanLevel = 'analyzed'"),
  'starting mining must not reveal unknown asteroid resources'
);
assert(
  service.includes("asteroid.scanLevel = 'analyzed'") &&
    service.includes('for (const deposit of asteroid.deposits) deposit.identified = true'),
  'close scan must reveal all asteroid resources'
);
assert(
  miningChunks.includes('resourceId: deposit.resourceId') &&
    miningChunks.includes('sourceAsteroidId: asteroid.id'),
  'mined chunks must retain their resource identity and source asteroid'
);
assert(
  miningChunks.includes('identifyMinedResource') &&
    miningChunks.includes('samples.push({') &&
    service.includes('identifyMinedResource(asteroid, sample.resourceId)'),
  'resource identity must be revealed only after a chunk is accepted into cargo'
);
assert(
  miningChunks.includes('deposit.oreRemaining -= amount'),
  'extracted chunks must reduce the recovered target deposit'
);
assert(
  miningChunks.includes('collateralLoss') &&
    miningChunks.includes('amount * 0.5') &&
    miningChunks.includes('selected.has(other.resourceId)'),
  'targeted mining must waste unselected deposits at half the individual target rate'
);
assert(
  miningChunks.includes('activeDeposits[chunkCounter % activeDeposits.length]'),
  'mining must rotate deterministically across selected remaining deposits'
);
assert(
  service.includes('setMiningResourceSelection') &&
    miningResourceRuntime.includes('unique.length < 1 || unique.length > 2'),
  'local mining must support ALL or exactly one/two targeted resources'
);
assert(
  miningResourceRuntime.includes('selections = new Map') &&
    service.includes('this.miningResources.selectionFor(this.selectedAsteroidId)'),
  'targeted mining choices must persist per asteroid across UI focus changes'
);
assert(
  miningChunks.includes('collector?.(chunk.resourceId, chunk.amount, chunk.sourceAsteroidId)') &&
    miningChunks.includes('advanceAndCollectMiningChunks') &&
    miningResourceRuntime.includes('advanceAndCollectMiningChunks(') &&
    miningResourceRuntime.includes('this.collectedResources.set('),
  'recovered chunks must pass through the economy callback before local cargo is credited'
);
assert(
  service.includes('hasMineableDeposits'),
  'mining must continue until all asteroid deposits are depleted'
);
assert(
  service.includes('this.miningEvents.pauseExtraction(asteroid, deltaSeconds)') &&
    service.includes('resolveMiningEvent(choiceId'),
  'live extraction must pause for integrated mining decisions'
);
assert(
  miningEvents.includes("'unstable'") &&
    miningEvents.includes("'machine'") &&
    miningEvents.includes("'rich'") &&
    miningEvents.includes("'cavity'") &&
    miningEvents.includes("'rare'") &&
    miningEvents.includes("'deeper'"),
  'mining events must migrate the six physical Voidbound mining hazards without fake NPC encounters'
);
assert(
  service.includes('shipLateralVelocity'),
  'ship station keeping must use real lateral velocity'
);
assert(
  service.includes('updateIdleStationKeeping'),
  'idle state must use extracted physical station keeping'
);
assert(
  stationKeeping.includes('applyDisturbance'),
  'idle station keeping must receive recurring small disturbances'
);
assert(
  stationKeeping.includes('applyHeadingKeeping'),
  'idle station keeping must correct residual rotation'
);
assert(
  stationKeeping.includes('angularThrust'),
  'idle attitude correction must drive RCS turn commands'
);
assert(
  miningController.includes('resolveShipLocalCruiseSpeed(') &&
    miningController.includes('runtime.stationSkills.piloting') &&
    miningController.includes('engineSpeedMultiplier(runtime.installed)') &&
    miningController.includes('runtime.crewEffects.piloting.turnRateMultiplier'),
  'local-space navigation must apply fitted drive and real crew speed/RCS modifiers'
);
assert(
  service.includes('miningHoldOffset'),
  'mining must remember a relative offset to the target asteroid'
);
assert(
  miningFormation.includes('asteroid.position.x + holdOffset.x'),
  'mining formation must move its desired point with the target asteroid'
);
assert(
  service.includes('shipForwardVelocity'),
  'mining formation must follow or back away along the ship axis'
);
assert(
  service.includes('updateMiningFormation'),
  'mining must actively maintain formation with a drifting target'
);
assert(
  miningFormation.includes('closestClosingDebris'),
  'mining station keeping must react to incoming debris'
);
assert(service.includes('currentMiningImpact'), 'service must expose one shared mining impact');
assert(
  miningChunks.includes('position: {\n      x: impact.point.x'),
  'mining chunks must spawn from the impact point'
);

assert(
  miningChunks.includes('tractorHardpointId') &&
    miningChunks.includes('tractorHardpointWorldPosition') &&
    miningChunks.includes('tractor.x - hardpoints.pivot.x') &&
    miningChunks.includes('tractor.y - hardpoints.pivot.y'),
  'mining tractor chunks must target their assigned tractor hardpoint instead of ship center'
);
assert(
  miningChunks.includes('distance(chunk.position, tractorTarget) < 24'),
  'mined chunks must be collected at the tractor emitter position'
);
assert(
  miningResourceRuntime.includes('this.hardpoints') &&
    miningResourceRuntime.includes('this.nominalLengthMeters'),
  'chunk runtime must provide hardpoint geometry for tractor targeting'
);
assert(
  service.includes('getMiningRouteOptions'),
  'local-space service must expose immutable route-planning input'
);
assert(
  !fs
    .readFileSync(path.join(root, 'src/systems/local-space/local-space-service.ts'), 'utf8')
    .includes('planMiningApproachRoute('),
  'local-space service must not block the UI with synchronous route planning'
);
assert(
  routeWorkerClient.includes(
    "new Worker(new URL('./local-space-route-worker.ts', import.meta.url)"
  ),
  'mining route planning must run in a web worker'
);
assert(
  routeWorker.includes('planMiningApproachRoute(event.data.options)'),
  'route worker must own the expensive route calculation'
);
assert(
  routeWorker.includes("event.data.kind === 'point'"),
  'route worker must handle point routes'
);
assert(
  routeWorkerClient.includes("requestRoute('point'"),
  'point route planning must stay off the UI thread'
);
assert(
  controller.includes('createLocalPanelActions') &&
    localActions.includes('planMiningApproachRouteAsync'),
  'game controller must await asynchronous mining route calculation'
);
assert(service.includes('approachRoute'), 'approach must persist a fixed precomputed route');
assert(
  service.includes('navigationRoute'),
  'manual navigation must persist a fixed precomputed route'
);
assert(
  autopilot.includes('desiredSpeed') && autopilot.includes('remainingDistance * 0.72'),
  'manual navigation must decelerate near the clicked target'
);
assert(!service.includes('findApproachWaypoint'), 'approach must not live-replan around obstacles');
assert(autopilot.includes('MAX_TURN_RATE'), 'route following must limit ship turning speed');
assert(
  autopilot.includes('REVERSE_CORRECTION_DISTANCE') &&
    autopilot.includes('advanceReverseCorrection') &&
    autopilot.includes('ship.speed = -reverseSpeed'),
  'short final corrections behind the ship must use reverse thrust without turning around'
);
assert(
  service.includes('false,\n      true') && service.includes('true,\n      true'),
  'manual navigation and mining approach must allow short reverse corrections'
);
assert(service.includes('integrateAsteroids'), 'service must advance rigid asteroid physics');
assert(
  service.includes('resolveAsteroidCollisions'),
  'service must resolve asteroid-to-asteroid collisions'
);
assert(navigation.includes('findGridRoute'), 'route planner must search a navigable path');
assert(
  navigation.includes('planPointRoute'),
  'route planner must support arbitrary clicked destinations'
);
assert(
  navigation.includes('options.clearance * 0.72') &&
    navigation.includes('options.clearance * 0.45') &&
    navigation.includes('options.clearance * 0.2'),
  'point navigation must progressively relax clearance before giving up'
);
assert(
  navigation.includes('compromised: true'),
  'best-effort navigation must flag routes with reduced safety'
);
assert(
  navigation.includes('class MinPriorityQueue'),
  'A-star open nodes must use a priority queue instead of linear scans'
);
assert(
  navigation.includes('MAX_ROUTE_CANDIDATES = 4'),
  'route planner must bound expensive approach candidate searches'
);
assert(navigation.includes('routeBlocking'), 'route planner must ignore non-blocking debris');
assert(
  physics.includes('applyImpulseAtPoint'),
  'physics must apply force at an explicit contact point'
);
assert(
  physics.includes('centerOfMassWorld'),
  'impulse torque must reference the asteroid center of mass'
);
assert(physics.includes('momentOfInertia'), 'angular response must use moment of inertia');
assert(
  collision.includes('rotationalMassTerm'),
  'asteroid collisions must include rotational collision response'
);
assert(
  collision.includes('resolveAsteroidCollisions'),
  'asteroid pair collisions must be implemented'
);
assert(
  collision.includes('COLLISION_CELL_SIZE') && collision.includes('collisionBuckets'),
  'asteroid collisions must use a spatial-grid broadphase'
);
assert(collision.includes('contactPoint'), 'collisions must calculate a contact point');
assert(
  collision.includes('surfaceAnchor') && collision.includes('surfaceMetric'),
  'shield collisions must capture a ship-local normalized surface anchor'
);
assert(
  miningImpact.includes('hardpoints.miningLasers'),
  'mining impact must derive from actual laser hardpoints'
);
assert(
  miningImpact.includes('asteroid.position.x - direction.x * asteroid.radius'),
  'mining impact must lie on the asteroid surface'
);
assert(!service.includes('Canvas'), 'local-space simulation must stay renderer-independent');
assert(
  shipSystems.includes('applyShieldHit') && service.includes('this.shipSystems.applyCollision'),
  'asteroid impacts must damage the shield through the ship-systems runtime'
);
assert(
  shipSystems.includes('overflowDamage') && shipSystems.includes('hull.currentHp'),
  'shield overflow damage must continue into the ship hull'
);
assert(
  collision.includes('kineticEnergy: 0.5 * asteroid.physics.mass * impactSpeed * impactSpeed'),
  'asteroid shield damage must derive from mass and normal impact speed'
);
assert(
  collision.includes('targetWorldOutwardSpeed = shipNormalVelocity + targetRelativeOutwardSpeed'),
  'shield rebound must include the moving ship velocity frame'
);
assert(
  collision.includes('impactSpeed * shieldRestitution(asteroid)') &&
    collision.includes('shieldEnergyBoost(impactSpeed, asteroid)'),
  'shield rebound must scale from actual impact speed with only a small shield boost'
);
assert(
  !collision.includes('return 180'),
  'small debris must not receive a fixed high-speed shield kick'
);
assert(
  collision.includes("a.kind === 'debris' || b.kind === 'debris' ? 0.32 : 0.22"),
  'asteroid-to-asteroid collisions must transfer momentum with restrained restitution'
);
assert(
  shieldService.includes('REFERENCE_IMPACT_ENERGY'),
  'shield service must normalize kinetic impact energy'
);
assert(
  shieldService.includes('/ state.modifier'),
  'better shield modifiers must reduce incoming damage'
);
assert(
  shieldTypes.includes('ShieldDamageSource'),
  'shield damage model must be reusable by future weapon sources'
);
assert(
  starController.includes("locationHasActivity(options.world(), id, 'mine')") &&
    starController.includes('snapshot.currentLocationId === id'),
  'every mining location must support direct re-entry'
);
assert(!service.includes('document.'), 'local-space simulation must stay DOM-independent');

console.log('PASS local-space route, rigid asteroid physics, debris and collision ownership');
