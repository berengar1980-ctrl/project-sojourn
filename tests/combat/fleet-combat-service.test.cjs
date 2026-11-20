'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const input = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(input, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(code, filename);
};
try {
  const { createFleetCombatService } = require(
    path.join(root, 'src/systems/combat/fleet-combat-service.ts')
  );
  function combatant(id) {
    return {
      id,
      name: id,
      shipId: 'test-ship',
      shieldHp: 100,
      hullHp: 100,
      weapons: [
        {
          id: 'test-gun',
          name: 'Testgun',
          type: 'weapon',
          weapon: {
            family: 'pulse_laser',
            mount: 'turret',
            rangeMeters: 5000,
            cooldownSeconds: 0.25,
            shieldDamage: 20,
            hullDamage: 15,
          },
        },
      ],
      hitChance: 1,
      dodgeChance: 0,
      damageMultiplier: 1,
      criticalChance: 0,
      cycleTimeMultiplier: 1,
      combatSpeed: 120,
      preferredTactic: 'fight',
    };
  }
  const arena = { width: 7000, height: 5000, asteroids: [], obstacles: [] };
  assert.throws(
    () =>
      createFleetCombatService(
        [{ setup: combatant('only'), factionId: 'a', position: { x: 100, y: 100 } }],
        arena
      ),
    /at least three/
  );
  const sim = createFleetCombatService(
    [
      {
        setup: combatant('player'),
        factionId: 'player',
        position: { x: 2000, y: 2500 },
        targetId: 'a',
      },
      {
        setup: combatant('a'),
        factionId: 'pirates',
        position: { x: 2400, y: 2200 },
        targetId: 'player',
      },
      {
        setup: combatant('b'),
        factionId: 'pirates',
        position: { x: 2400, y: 2800 },
        targetId: 'player',
      },
    ],
    arena
  );
  assert.equal(sim.getSnapshot().ships.length, 3);
  assert.equal(sim.getSnapshot().elapsedSeconds, 0);
  assert.throws(() => sim.setTarget('a', 'b'), /Invalid FleetCombat target/);
  assert.throws(() => sim.setTarget('missing', 'player'), /Unknown FleetCombat ship/);
  sim.tick(0);
  assert.equal(sim.getSnapshot().elapsedSeconds, 0);
  let hits = 0;
  for (let step = 0; step < 100; step += 1) {
    const view = sim.tick(0.08);
    for (const shot of view.shots) {
      hits += 1;
      assert.notEqual(shot.sourceId, shot.targetId);
      assert(['player', 'a', 'b'].includes(shot.sourceId));
      assert(['player', 'a', 'b'].includes(shot.targetId));
      assert(shot.shieldDamage >= 0 && shot.hullDamage >= 0);
    }
    for (const ship of view.ships) {
      assert(Number.isFinite(ship.ship.position.x));
      assert(Number.isFinite(ship.ship.position.y));
      assert(ship.ship.hullHp >= 0 && ship.ship.shieldHp >= 0);
    }
  }
  assert(hits > 0, 'three combatants should fire in the same shared world');
  const view = sim.getSnapshot();
  assert(view.ships.some((ship) => ship.ship.shieldHp < 100 || ship.ship.hullHp < 100));
  const target = view.ships.find((ship) => ship.ship.id === 'a');
  assert(target, 'stable combat ship IDs are preserved');
  console.log('PASS first 2vs1 fleet kernel: shared world, IDs, movement and layered damage');
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
