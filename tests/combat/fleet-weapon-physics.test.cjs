'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const input = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(input, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
try {
  const { createCombatant } = require(path.join(root, 'src/systems/combat/strategic-combat-geometry.ts'));
  const { createFleetWeaponPhysics } = require(path.join(root, 'src/systems/combat/fleet-weapon-physics.ts'));

  const arena = () => ({ width: 5000, height: 4000, obstacles: [], asteroids: [] });
  const setup = (id, family, mount = 'turret') => ({
    id, name: id, shipId: 'test-ship', shieldHp: 100, hullHp: 100,
    weapons: family ? [{
      id: id + '-gun', name: family, type: 'weapon',
      weapon: { family, mount, rangeMeters: 1500, cooldownSeconds: 0.2,
        shieldDamage: 40, hullDamage: 35 },
    }] : [],
    hitChance: 1, dodgeChance: 0, damageMultiplier: 1, criticalChance: 0,
    cycleTimeMultiplier: 1, preferredTactic: 'fight',
  });
  function actor(id, family, x, y, mount) {
    const ship = createCombatant(setup(id, family, mount), 'attacker', {
      ...arena(), attackerPosition: { x, y },
    });
    ship.cooldowns.fill(0);
    return ship;
  }
  // Real 1vs1 laser physics: clear line, immediate shield, telemetry, cadence.
  const laserWorld = arena();
  const laser = createFleetWeaponPhysics(laserWorld, () => 0.5);
  const attacker = actor('attacker', 'pulse_laser', 1000, 1000);
  const victim = actor('victim', null, 1400, 1000);
  const witness = actor('witness', null, 2000, 2000);
  const laserHits = laser.tick(0.08, 0.08, [attacker, victim, witness],
    (ship) => ship === attacker ? victim : null);
  assert.equal(laserHits.length, 1, 'laser hits through the native shield calculation');
  assert(laserHits[0].shieldDamage > 0);
  assert.equal(laserHits[0].hullDamage, 0);
  assert.equal(attacker.weaponTelemetry[0].shotsFired, 1);
  assert.equal(laser.beams().length, 1);
  assert.equal(laser.projectiles().length, 0);

  // Cover blocks fire before cooldown/munition are consumed.
  const covered = arena();
  covered.obstacles.push({ id: 'rock', position: { x: 1200, y: 1000 }, radius: 60 });
  const blocked = createFleetWeaponPhysics(covered, () => 0.5);
  const blockedSource = actor('blocked', 'pulse_laser', 1000, 1000);
  const blockedTarget = actor('blocked-target', null, 1400, 1000);
  assert.equal(blocked.tick(0.08, 0.08, [blockedSource, blockedTarget, witness],
    (ship) => ship === blockedSource ? blockedTarget : null).length, 0);
  assert.equal(blockedSource.weaponTelemetry[0].shotsFired, 0);

  // Ballistic shots move through space and never apply damage at launch.
  const ballistic = createFleetWeaponPhysics(arena(), () => 0.5);
  const gunner = actor('gunner', 'autocannon', 1000, 1000);
  const projectileTarget = actor('projectile-target', null, 1600, 1000);
  const contacts = [gunner, projectileTarget, witness];
  const targetFor = (ship) => ship === gunner ? projectileTarget : null;
  assert.equal(ballistic.tick(0.08, 0.08, contacts, targetFor).length, 0);
  assert.equal(projectileTarget.shieldHp, 100, 'projectile does not teleport damage');
  assert.equal(ballistic.projectiles().length, 1);
  assert.equal(ballistic.projectiles()[0].targetId, 'projectile-target');
  let actualHits = [];
  for (let index = 1; index < 12; index++) {
    actualHits.push(...ballistic.tick(0.08, (index + 1) * 0.08, contacts, targetFor));
  }
  assert(actualHits.some((hit) => hit.targetId === 'projectile-target'),
    'projectile eventually hits its actual target');
  assert(projectileTarget.shieldHp < 100);
  assert.equal(witness.shieldHp, 100, 'independent third ship stays untouched');

  // A missile cannot pass through an obstacle between its launch and target.
  const missileArena = arena();
  const missilePhysics = createFleetWeaponPhysics(missileArena, () => 0.5);
  const missileShip = actor('missile', 'guided_missile', 1000, 1000);
  const missileTarget = actor('missile-target', null, 1450, 1000);
  const missileActors = [missileShip, missileTarget, witness];
  missilePhysics.tick(0.08, 0.08, missileActors,
    (ship) => ship === missileShip ? missileTarget : null);
  assert.equal(missilePhysics.projectiles().length, 1);
  missileArena.obstacles.push({ id: 'late-cover', position: { x: 1190, y: 1000 }, radius: 80 });
  for (let index = 1; index < 12; index++) {
    missilePhysics.tick(0.08, (index + 1) * 0.08, missileActors,
      (ship) => ship === missileShip ? missileTarget : null);
  }
  assert.equal(missileTarget.shieldHp, 100, 'native obstacle raycast stops flying missile');
  console.log('PASS FleetCombat native fire control, line of sight, ballistics, shield and cover');
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
