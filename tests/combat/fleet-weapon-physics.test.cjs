'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const input = fs.readFileSync(filename, 'utf8');
  module._compile(
    ts.transpileModule(input, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );
};
try {
  const { createCombatant } = require(
    path.join(root, 'src/systems/combat/strategic-combat-geometry.ts')
  );
  const { createFleetWeaponPhysics } = require(
    path.join(root, 'src/systems/combat/fleet-weapon-physics.ts')
  );

  const arena = () => ({ width: 5000, height: 4000, obstacles: [], asteroids: [] });
  const setup = (id, family, mount = 'turret') => ({
    id,
    name: id,
    shipId: 'test-ship',
    shieldHp: 100,
    hullHp: 100,
    weapons: family
      ? [
          {
            id: id + '-gun',
            name: family,
            type: 'weapon',
            weapon: {
              family,
              mount,
              rangeMeters: 1500,
              cooldownSeconds: 0.2,
              shieldDamage: 40,
              hullDamage: 35,
            },
          },
        ]
      : [],
    hitChance: 1,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    preferredTactic: 'fight',
  });
  function actor(id, family, x, y, mount) {
    const ship = createCombatant(setup(id, family, mount), 'attacker', {
      ...arena(),
      attackerPosition: { x, y },
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
  const laserHits = laser.tick(0.08, 0.08, [attacker, victim, witness], (ship) =>
    ship === attacker ? victim : null
  );
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
  assert.equal(
    blocked.tick(0.08, 0.08, [blockedSource, blockedTarget, witness], (ship) =>
      ship === blockedSource ? blockedTarget : null
    ).length,
    0
  );
  assert.equal(blockedSource.weaponTelemetry[0].shotsFired, 0);

  // Ballistic shots move through space and never apply damage at launch.
  const ballistic = createFleetWeaponPhysics(arena(), () => 0.5);
  const gunner = actor('gunner', 'autocannon', 1000, 1000);
  const projectileTarget = actor('projectile-target', null, 1600, 1000);
  const contacts = [gunner, projectileTarget, witness];
  const targetFor = (ship) => (ship === gunner ? projectileTarget : null);
  assert.equal(ballistic.tick(0.08, 0.08, contacts, targetFor).length, 0);
  assert.equal(projectileTarget.shieldHp, 100, 'projectile does not teleport damage');
  assert.equal(ballistic.projectiles().length, 1);
  assert.equal(ballistic.projectiles()[0].targetId, 'projectile-target');
  const actualHits = [];
  for (let index = 1; index < 12; index++) {
    actualHits.push(...ballistic.tick(0.08, (index + 1) * 0.08, contacts, targetFor));
  }
  assert(
    actualHits.some((hit) => hit.targetId === 'projectile-target'),
    'projectile eventually hits its actual target'
  );
  assert(projectileTarget.shieldHp < 100);
  assert.equal(witness.shieldHp, 100, 'independent third ship stays untouched');

  // A missile cannot pass through an obstacle between its launch and target.
  const missileArena = arena();
  const missilePhysics = createFleetWeaponPhysics(missileArena, () => 0.5);
  const missileShip = actor('missile', 'guided_missile', 1000, 1000);
  const missileTarget = actor('missile-target', null, 1450, 1000);
  const missileActors = [missileShip, missileTarget, witness];
  missilePhysics.tick(0.08, 0.08, missileActors, (ship) =>
    ship === missileShip ? missileTarget : null
  );
  assert.equal(missilePhysics.projectiles().length, 1);
  missileArena.obstacles.push({ id: 'late-cover', position: { x: 1190, y: 1000 }, radius: 80 });
  for (let index = 1; index < 12; index++) {
    missilePhysics.tick(0.08, (index + 1) * 0.08, missileActors, (ship) =>
      ship === missileShip ? missileTarget : null
    );
  }
  assert.equal(missileTarget.shieldHp, 100, 'native obstacle raycast stops flying missile');

  // FC-43: an allied ship is just as solid as the intended hostile target.
  const beamWorld = createFleetWeaponPhysics(arena(), () => 0.5);
  const beamSource = actor('beam-source', 'pulse_laser', 1000, 1000);
  const beamAlly = actor('beam-ally', null, 1200, 1000);
  const beamEnemy = actor('beam-enemy', null, 1500, 1000);
  const friendlyHits = beamWorld.tick(0.08, 0.08,
    [beamSource, beamAlly, beamEnemy], (ship) => ship === beamSource ? beamEnemy : null);
  assert.equal(friendlyHits.length, 1, 'one beam resolves only the first ship');
  assert.equal(friendlyHits[0].targetId, 'beam-ally', 'friendly ship physically intercepts laser');
  assert.equal(beamEnemy.shieldHp, 100, 'no piercing past friendly ship');
  assert(beamWorld.beams()[0].end.x < beamEnemy.position.x);

  // The FIRST rock/obstacle wins if it is closer than every possible ship.
  const rockCover = arena();
  rockCover.obstacles.push({ id: 'beam-cover', position: { x: 1110, y: 1000 }, radius: 28 });
  const rockBlocked = createFleetWeaponPhysics(rockCover, () => 0.5);
  const coverShooter = actor('cover-shooter', 'railgun', 1000, 1000);
  const coverFriend = actor('cover-friend', null, 1300, 1000);
  const coverEnemy = actor('cover-enemy', null, 1450, 1000);
  assert.equal(rockBlocked.tick(0.08, 0.08, [coverShooter, coverFriend, coverEnemy],
    (ship) => ship === coverShooter ? coverEnemy : null).length, 0);
  assert.equal(coverFriend.shieldHp, 100);

  // A low accuracy roll creates genuine lateral dispersion. Even then,
  // the projectile can intersect a different moving/neutral ship.
  const missSequence = [0.5, 0.99, 0.75];
  const drifting = createFleetWeaponPhysics(arena(), () => missSequence.shift() ?? 0.5);
  const missShooter = actor('miss-shooter', 'autocannon', 1000, 1000);
  const missEnemy = actor('miss-enemy', null, 1600, 1000);
  const accidental = actor('accidental-civilian', null, 1400, 1074);
  assert.equal(drifting.tick(0.08, 0.08, [missShooter, missEnemy, accidental],
    (ship) => ship === missShooter ? missEnemy : null).length, 0);
  assert.equal(drifting.projectiles().length, 1);
  assert.equal(drifting.projectiles()[0].missed, true, 'accuracy roll missed original aim');
  assert(drifting.projectiles()[0].direction.y > 0.08, 'miss is a real angular trajectory');
  const missHits = [];
  for (let tick = 1; tick < 15; tick++) missHits.push(...drifting.tick(
    0.08, 0.08 * (tick + 1), [missShooter, missEnemy, accidental], () => null
  ));
  assert(missHits.some((shot) => shot.targetId === 'accidental-civilian' &&
    shot.sourceId === 'miss-shooter'), 'miss can still strike an innocent ship');
  assert.equal(missEnemy.shieldHp, 100, 'miss does not damage the original target');

  // Move into the actual trajectory after launch: dynamic contacts must be
  // evaluated on every physics substep, not only once at trigger time.
  const moving = createFleetWeaponPhysics(arena(), () => 0.5);
  const movingShooter = actor('moving-shooter', 'autocannon', 1000, 1000);
  const movingEnemy = actor('moving-enemy', null, 1600, 1000);
  const movingAlly = actor('moving-ally', null, 1350, 1200);
  moving.tick(0.08, 0.08, [movingShooter, movingEnemy, movingAlly],
    (ship) => ship === movingShooter ? movingEnemy : null);
  movingAlly.position.y = 1000;
  const movingHits = [];
  for (let tick = 1; tick < 12; tick++) movingHits.push(...moving.tick(
    0.08, 0.08 * (tick + 1), [movingShooter, movingEnemy, movingAlly], () => null
  ));
  assert(movingHits.some((hit) => hit.targetId === 'moving-ally'),
    'a moving friendly can enter the path after launch');
  assert.equal(movingEnemy.shieldHp, 100);
  console.log('PASS FleetCombat native fire control, line of sight, ballistics, shield, cover and physical collateral');
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
