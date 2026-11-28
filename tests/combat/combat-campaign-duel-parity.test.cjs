'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const arena = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-arena.ts');
const shipStats = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-stats.ts');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
for (const role of ['patrol', 'freighter', 'mining', 'salvage']) {
  const ship = { role, navigation: { cruiseSpeed: 480 }, nominalLengthMeters: 85 };
  assert.equal(
    shipStats.resolveShipLocalCruiseSpeed(ship),
    shipStats.resolveShipCombatMovementStats(ship).combatSpeed,
    role + ' shares unboosted combat and local cruise speed'
  );
}
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-test',
  shieldHp: 70,
  hullHp: 100,
  weapons: [],
  hitChance: 1,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
});
const attacker = setup('attacker'),
  defender = setup('defender');
const options = {
  width: 1800,
  height: 1200,
  attackerPosition: { x: 600, y: 650 },
  defenderPosition: { x: 1300, y: 650 },
  attackerVelocity: { x: -23, y: 41 },
  defenderVelocity: { x: 12, y: -7 },
  attackerHeadingRadians: 1.4,
  defenderHeadingRadians: -0.7,
};
const prepared = arena.buildCombatArena(attacker, defender, 1234, options);
const first = geometry.createCombatant(attacker, 'attacker', prepared);
const second = geometry.createCombatant(defender, 'defender', prepared);
assert.deepEqual(first.velocity, options.attackerVelocity);
assert.deepEqual(second.velocity, options.defenderVelocity);
assert.equal(first.headingRadians, options.attackerHeadingRadians);
assert.equal(second.headingRadians, options.defenderHeadingRadians);
assert.equal(first.speed, Math.hypot(-23, 41));
const defaults = geometry.createCombatant(attacker, 'attacker', prepared);
assert.deepEqual(defaults.position, options.attackerPosition);
const campaign = read('src/app/game-controller.ts');
assert(campaign.includes('startPlayerMiningCombat(context, id)'));

const campaignArena = read('src/systems/combat/field-combat-arena.ts');
const miningCombatAction = read('src/app/game-controller-mining-combat-action.ts');
const campaignEntry = read('src/app/game-controller-combat.ts');
assert(
  /localMiningCombatArena\s*\(\s*local\.instance\s*,\s*state\.localSpace!\.getShipWorldVelocity\(\)\s*,/.test(
    miningCombatAction
  ),
  'campaign delegates arena setup using full local inertial velocity'
);
assert(
  campaignArena.includes('...instance.asteroids.map(') &&
    campaignEntry.includes('miningFieldCombatArena as localMiningCombatArena'),
  'mining arena preserves moving asteroid bodies'
);
assert(
  miningCombatAction.includes('defenderHeadingRadians: target.headingRadians') &&
    miningCombatAction.includes('defenderVelocity: {'),
  'mining combat also inherits the target ship motion'
);
assert(
  campaignArena.includes('attackerHeadingRadians: instance.ship.headingRadians'),
  'mining arena carries over player heading'
);
const localService = read('src/systems/local-space/local-space-service.ts');
assert(
  localService.includes('getShipWorldVelocity(): WorldPoint'),
  'local-space exposes its authoritative instantaneous world velocity'
);
const salvage = read('src/app/game-controller-salvage.ts');
const salvageCombatEntry = read('src/app/game-controller-salvage-attack.ts');
assert(
  salvageCombatEntry.includes('attackerHeadingRadians: playerShip.headingRadians'),
  'salvage encounters transfer the player heading'
);
assert(
  salvageCombatEntry.includes('defenderHeadingRadians: target.headingRadians') &&
    salvageCombatEntry.includes('defenderVelocity: {'),
  'salvage combat also inherits the target ship motion'
);
assert(
  salvageCombatEntry.includes('attackerVelocity: {'),
  'salvage encounters transfer the player starting velocity'
);
const mining = read('src/app/game-controller-mining.ts');
const npcMining = read('src/systems/npcs/npc-local-mining-service.ts');
const npcSalvage = read('src/systems/npcs/npc-local-salvage-service.ts');
const npcLocalPose = read('src/systems/npcs/npc-local-physical-pose.ts');
for (const localSetup of [mining, salvage]) {
  assert(localSetup.includes('resolveShipCombatMovementStats('));
  assert(localSetup.includes('runtime.stationSkills.piloting'));
  assert(localSetup.includes('approachSpeed: flightPerformance.combatSpeed'));
  assert(localSetup.includes('flightPerformance,'));
}
assert(npcMining.includes('localNpcCruiseSpeed(npc, FLIGHT_SPEED)'));
assert(npcSalvage.includes('localNpcCruiseSpeed(npc, FLIGHT_SPEED)'));
assert(npcLocalPose.includes('resolveShipCombatMovementStats'));
assert(npcLocalPose.includes('ensureNpcInstalledComponents(npc)'));
const combatProfile = read('src/systems/ships/ship-combat-profile.ts');
assert(combatProfile.includes('crewSkillEffects('));
assert(combatProfile.includes('effects.sensors.weaponHitChanceBonus'));
for (const setupFile of [
  'src/app/game-controller-combat.ts',
  'src/systems/combat/npc-combatant-setup.ts',
  'src/ui/start/duel-combatant-setup.ts',
]) {
  assert(read(setupFile).includes('resolveShipCombatProfile('), setupFile);
}
const shared = 'combatEquippedWeapons';
for (const setupFile of [
  'src/ui/start/duel-combatant-setup.ts',
  'src/app/game-controller-combat.ts',
  'src/systems/combat/npc-combatant-setup.ts',
]) {
  const source = read(setupFile);
  assert(source.includes(shared), setupFile + ' uses shared weapon slot mapping');
  assert(source.includes('combatWeaponMounts'), setupFile + ' uses shared mount geometry');
}
const motion = read('src/systems/combat/combat-asteroid-motion.ts');
assert(
  motion.includes('if (obstacle.id !== body.id) continue'),
  'moving asteroid blockers must stay synchronized with physical bodies'
);
const combatCamera = read('src/ui/combat/combat-camera.ts');
assert(
  combatCamera.includes('Math.max(1, Math.min(4.6,'),
  'duel and embedded-map camera share relative zoom limits'
);
const duel = read('src/ui/start/duel-lobby.ts');
const engagements = read('src/systems/combat/star-map-engagement-service.ts');
assert(duel.includes('createStrategicCombatService('));
const campaignFleet = read('src/systems/combat/career-fleet-encounter.ts');
const dynamic = read('src/systems/combat/dynamic-fleet-combat.ts');
const nativeFleet = read('src/systems/combat/parallel-native-duels.ts');
assert(
  engagements.includes('createCareerFleetEncounter(') &&
    engagements.includes('createNpcFleetEncounter(') &&
    campaignFleet.includes('createDynamicFleetCombat(') &&
    dynamic.includes('createParallelNativeDuels(') &&
    nativeFleet.includes('createStrategicCombatService('),
  'campaign and duel must share the native 1vs1 simulator through FleetCombat'
);
console.log('PASS campaign/duel shared simulator and preserved combat entry motion');
