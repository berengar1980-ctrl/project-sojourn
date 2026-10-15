'use strict';
const assert = require('node:assert/strict');
const { load } = require('./maneuver-fixtures.cjs');
const { DUEL_ENCOUNTERS, resolveDuelPreset } = load('src/ui/start/duel-presets.ts');
const { duelCombatant } = load('src/ui/start/duel-combatant-setup.ts');
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const { crewDefinitions } = load('src/data/crew/crew-definitions.ts');
const { createDuelArena } = load('src/systems/combat/duel-arena-presets.ts');
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
const ships = getAllShipDefinitions();
const reports = [];
for (const preset of DUEL_ENCOUNTERS) {
  const setups = resolveDuelPreset(preset, ships).map((side, index) => {
    const ship = ships.find((s) => s.id === side.shipId);
    const setup = duelCombatant(
      index,
      { ...side, crewId: crewDefinitions[side.crewIndex].id, mines: [] },
      ship
    );
    return { ...setup, shieldHp: 100000, hullHp: 100000 };
  });
  const arena = { ...createDuelArena('scattered', preset.seed), allowBoarding: false };
  const combat = createStrategicCombatService(setups[0], setups[1], preset.seed, arena);
  combat.setTactic('attacker', 'fight');
  combat.setTactic('defender', 'fight');
  let previous = combat.getSnapshot();
  const metrics = [
    { shots: 0, maxQuiet: 0, quiet: 0, changes: 0 },
    { shots: 0, maxQuiet: 0, quiet: 0, changes: 0 },
  ];
  for (let i = 0; i < 750; i++) {
    const next = combat.tick(0.08);
    assert.equal(next.winner, null);
    for (const [k, side] of ['attacker', 'defender'].entries()) {
      const m = metrics[k],
        a = next[side],
        b = previous[side];
      const shot = a.fireControl.lastShotAt > b.fireControl.lastShotAt;
      m.shots += Number(shot);
      m.quiet = shot ? 0 : m.quiet + 0.08;
      m.maxQuiet = Math.max(m.maxQuiet, m.quiet);
      if (a.maneuver.serial !== b.maneuver?.serial) m.changes++;
    }
    previous = next;
  }
  for (const m of metrics) {
    assert(m.shots >= 10, preset.id + ' weapons starved ' + JSON.stringify(m));
    assert(m.maxQuiet < 20, preset.id + ' idle weapon window ' + JSON.stringify(m));
    assert(m.changes < 25, preset.id + ' maneuver churn ' + JSON.stringify(m));
  }
  reports.push({ preset: preset.id, metrics });
}
console.log(JSON.stringify(reports));
console.log(
  'PASS all nine real lobby presets with actual mounts, crew, mixed weapons and obstacles for 60 seconds'
);
