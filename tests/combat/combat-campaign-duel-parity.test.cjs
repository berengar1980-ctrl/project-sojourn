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
const campaignArena = read('src/app/game-controller-combat.ts');
assert(
  /localMiningCombatArena\s*\(\s*local\.instance\s*,\s*state\.localSpace!\.getShipWorldVelocity\(\)\s*\)/.test(
    campaign
  ),
  'campaign delegates arena setup using full local inertial velocity'
);
assert(
  campaignArena.includes('asteroids: instance.asteroids.map('),
  'mining arena preserves moving asteroid bodies'
);
assert(
  campaign.includes('defenderHeadingRadians: target.headingRadians') &&
    campaign.includes('defenderVelocity: {'),
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
assert(
  salvage.includes('attackerHeadingRadians: playerShip.headingRadians'),
  'salvage encounters transfer the player heading'
);
assert(
  salvage.includes('defenderHeadingRadians: target.headingRadians') &&
    salvage.includes('defenderVelocity: {'),
  'salvage combat also inherits the target ship motion'
);
assert(
  salvage.includes('attackerVelocity: {'),
  'salvage encounters transfer the player starting velocity'
);
const mining = read('src/app/game-controller-mining.ts');
const npcMining = read('src/systems/npcs/npc-local-mining-service.ts');
const npcSalvage = read('src/systems/npcs/npc-local-salvage-service.ts');
for (const localSetup of [mining, salvage]) {
  assert(localSetup.includes('resolveShipLocalCruiseSpeed('));
  assert(localSetup.includes('runtime.stationSkills.piloting'));
  assert(localSetup.includes('engineSpeedMultiplier(runtime.installed)'));
  assert(localSetup.includes('runtime.crewEffects.piloting.turnRateMultiplier'));
}
assert(npcMining.includes('localCruiseSpeed(npc)'));
assert(npcMining.includes('ensureNpcInstalledComponents(npc)'));
assert(npcSalvage.includes('localCruiseSpeed(npc)'));
assert(npcSalvage.includes('ensureNpcInstalledComponents(npc)'));
assert(read('src/app/game-controller-combat.ts').includes('hitChance: 0.68 +'));
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
assert(
  engagements.includes('createStrategicCombatService('),
  'campaign and duel must use the same simulator'
);
console.log('PASS campaign/duel shared simulator and preserved combat entry motion');
