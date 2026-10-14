'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const geometry = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-geometry.ts');
const arena = loadStandaloneTypeScriptModule(root, 'src/systems/combat/strategic-combat-arena.ts');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const setup = (id) => ({
  id, name: id, shipId: 'patrol-test', shieldHp: 70, hullHp: 100,
  weapons: [], hitChance: 1, dodgeChance: 0, damageMultiplier: 1,
  criticalChance: 0, cycleTimeMultiplier: 1,
});
const attacker = setup('attacker'), defender = setup('defender');
const options = {
  width: 1800, height: 1200,
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
assert(campaign.includes('asteroids: local.instance.asteroids.map('),
  'embedded campaign combat receives local moving asteroid bodies');
assert(campaign.includes('attackerHeadingRadians: local.instance.ship.headingRadians'));
assert(campaign.includes('attackerVelocity: state.localSpace!.getShipWorldVelocity()'),
  'the campaign transfers complete lateral and forward inertial motion');
const localService = read('src/systems/local-space/local-space-service.ts');
assert(localService.includes('getShipWorldVelocity(): WorldPoint'),
  'local-space exposes its authoritative instantaneous world velocity');
const salvage = read('src/app/game-controller-salvage.ts');
assert(salvage.includes('attackerHeadingRadians: playerShip.headingRadians'),
  'salvage encounters transfer the player heading');
assert(salvage.includes('attackerVelocity: {'),
  'salvage encounters transfer the player starting velocity');
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
assert(motion.includes('if (obstacle.id !== body.id) continue'),
  'moving asteroid blockers must stay synchronized with physical bodies');
const combatCamera = read('src/ui/combat/combat-camera.ts');
assert(combatCamera.includes('Math.max(1, Math.min(4.6,'),
  'duel and embedded-map camera share relative zoom limits');
const duel = read('src/ui/start/duel-lobby.ts');
const engagements = read('src/systems/combat/star-map-engagement-service.ts');
assert(duel.includes('createStrategicCombatService('));
assert(engagements.includes('createStrategicCombatService('),
  'campaign and duel must use the same simulator');
console.log('PASS campaign/duel shared simulator and preserved combat entry motion');
