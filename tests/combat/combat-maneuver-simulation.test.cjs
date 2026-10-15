'use strict';
const assert = require('node:assert/strict');
const { load, setup, arena } = require('./maneuver-fixtures.cjs');
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
function run(name, guns, facings, seed = 1001, dt = 0.08, rocks = []) {
  const combat = createStrategicCombatService(
    setup('a', guns, facings),
    setup('b', guns, facings),
    seed,
    {
      ...arena,
      obstacles: rocks,
      attackerPosition: { x: 1200, y: 1500 },
      defenderPosition: { x: 2400, y: 1500 },
      attackerHeadingRadians: 0,
      defenderHeadingRadians: Math.PI,
    }
  );
  combat.setTactic('attacker', 'fight');
  combat.setTactic('defender', 'fight');
  let prev = combat.getSnapshot();
  const metrics = ['attacker', 'defender'].map(() => ({
    shots: 0,
    changes: 0,
    labels: 0,
    travel: 0,
    recoveries: 0,
    completed: 0,
    maxQuiet: 0,
    quiet: 0,
  }));
  const trace = [];
  for (let i = 0; i < Math.round(120 / dt); i++) {
    const s = combat.tick(dt);
    assert.equal(s.winner, null, 'fixture must run full two minutes');
    for (const [k, side] of ['attacker', 'defender'].entries()) {
      const a = s[side],
        b = prev[side],
        m = metrics[k];
      const shot = a.fireControl.lastShotAt > b.fireControl.lastShotAt;
      if (shot) m.shots++;
      if (a.maneuver.serial !== b.maneuver?.serial) {
        m.changes++;
        if (a.maneuver.reason === 'Flugziel erreicht') m.completed++;
      }
      if (a.combatIntent !== b.combatIntent) m.labels++;
      m.travel += Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      m.quiet = shot ? 0 : m.quiet + dt;
      m.maxQuiet = Math.max(m.maxQuiet, m.quiet);
      m.recoveries = a.maneuver.recoveries;
      assert(Number.isFinite(a.flight.heading));
      if (a.flight.constraint === 'none' && a.strategy.focus === 'broadside') {
        const enemy = s[side === 'attacker' ? 'defender' : 'attacker'];
        const bearing = Math.atan2(
          enemy.position.y - a.position.y,
          enemy.position.x - a.position.x
        );
        const mount = a.strategy.broadsideFacing === 'starboard' ? Math.PI / 2 : -Math.PI / 2;
        // Heading command tracks mount orientation; actual rotation obeys physical limits.
        const error = Math.atan2(
          Math.sin(a.flight.heading + mount - bearing),
          Math.cos(a.flight.heading + mount - bearing)
        );
        if (a.maneuver.kind !== 'intercept')
          assert(Math.abs(error) < 0.08, 'selected side gun and flight order agree');
      }
    }
    if (i % Math.round(0.4 / dt) === 0)
      trace.push({ time: s.elapsedSeconds, a: s.attacker, b: s.defender });
    prev = s;
  }
  for (const m of metrics) {
    assert(m.shots >= 8, name + ': weapons must be used ' + JSON.stringify(m));
    assert(m.changes < 35, name + ': maneuver churn ' + JSON.stringify(m));
    assert(m.labels < 65, name + ': visible status churn ' + JSON.stringify(m));
    assert(m.maxQuiet < 25, name + ': long weapon starvation ' + JSON.stringify(m));
    assert(m.recoveries < 8, name + ': cyclic recovery ' + JSON.stringify(m));
  }
  return { name, seed, dt, metrics, trace };
}
const reports = [];
for (const seed of [1001, 1002, 77])
  reports.push(run('symmetric-front', ['weapon-railgun-1'], ['forward'], seed));
reports.push(run('symmetric-port', ['weapon-autocannon-1'], ['port']));
reports.push(run('symmetric-starboard', ['weapon-autocannon-1'], ['starboard']));
reports.push(
  run(
    'mixed-front-port-starboard',
    ['weapon-railgun-1', 'weapon-autocannon-1', 'weapon-autocannon-1', 'weapon1'],
    ['forward', 'port', 'starboard', 'forward']
  )
);
reports.push(
  run(
    'mixed-rocks',
    ['weapon-railgun-1', 'weapon-autocannon-1', 'weapon1'],
    ['forward', 'port', 'forward'],
    1001,
    0.04,
    [{ id: 'middle', position: { x: 1800, y: 1500 }, radius: 100 }]
  )
);
// Same geometry/equipment: seed may change hit rolls, never the selected AI implementation.
assert.deepEqual(reports[0].metrics, reports[1].metrics);
assert.deepEqual(reports[0].metrics, reports[2].metrics);
if (process.env.COMBAT_REPLAY_PATH)
  require('fs').writeFileSync(process.env.COMBAT_REPLAY_PATH, JSON.stringify(reports));
console.log(
  JSON.stringify(reports.map(({ name, seed, dt, metrics }) => ({ name, seed, dt, metrics })))
);
console.log(
  'PASS seven 120-second symmetric/mixed battles, no seed-dependent AI or maneuver/status livelock'
);
