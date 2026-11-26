'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');

const root = path.resolve(__dirname, '..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { registerSecurityDroneCombatants } = load('src/app/game-controller-economy.ts');
const { npcCombatant } = load('src/systems/combat/npc-combatant-setup.ts');
const { createParallelNativeDuels } = load('src/systems/combat/parallel-native-duels.ts');

const trials = Number(process.argv[2] ?? 100);
assert(Number.isInteger(trials) && trials > 0);
const roster = createSectorNpcEconomyStates();
registerSecurityDroneCombatants(roster);
const drone = roster.find((npc) => npc.id.startsWith('security-drone:'));
assert(drone && drone.shipId === '24m-security-drone');
const scenarios = [
  [1, 1, 'raider'],
  [1, 1, 'reaver'],
  [1, 1, 'marauder'],
  [2, 1, 'raider'],
  [2, 2, 'raider'],
  [2, 1, 'marauder'],
];

function makeShip(template, team, id) {
  const setup = npcCombatant({ ...structuredClone(template), id });
  assert(setup && setup.weapons.length > 0, id + ' must have real weapons');
  // Optional trial-only durability deltas: do not mutate ship registry or the engine.
  const droneTrial = template.id.startsWith('security-drone:');
  const marauderTrial = template.pirateClass === 'marauder';
  const hullDelta = droneTrial ? process.env.AUDIT_DRONE_HULL : marauderTrial ? process.env.AUDIT_MARAUDER_HULL : undefined;
  const shieldDelta = droneTrial ? process.env.AUDIT_DRONE_SHIELD : marauderTrial ? process.env.AUDIT_MARAUDER_SHIELD : undefined;
  return {
    id,
    team,
    setup: {
      ...setup,
      hullHp: setup.hullHp + Number(hullDelta ?? 0),
      shieldHp: setup.shieldHp + Number(shieldDelta ?? 0),
    },
  };
}

function trial(droneCount, pirateCount, pirates, seed) {
  const droneTeam = seed % 2 ? 'a' : 'b';
  const pirateTeam = droneTeam === 'a' ? 'b' : 'a';
  const defenders = Array.from({ length: droneCount }, (_, i) =>
    makeShip(drone, droneTeam, 'security-drone:audit-' + i)
  );
  const attackers = Array.from({ length: pirateCount }, (_, i) =>
    makeShip(pirates[(seed + i) % pirates.length], pirateTeam, 'pirate:audit-' + i)
  );
  const fleet = createParallelNativeDuels(
    [...defenders, ...attackers],
    { width: 4200, height: 2600, obstacles: [], asteroids: [] },
    seed
  );
  for (let frame = 0; frame < 4500 && !fleet.isFinished(); frame++) fleet.advance(0.08);
  const alive = (ships) =>
    ships.filter((ship) => (fleet.getActor(ship.id)?.hullHp ?? 0) > 0 && !fleet.hasEscaped(ship.id))
      .length;
  const d = alive(defenders);
  const p = alive(attackers);
  return d > 0 && p === 0 ? 'wins' : p > 0 && d === 0 ? 'losses' : 'unresolved';
}

for (const [droneCount, pirateCount, pirateClass] of scenarios) {
  const pirates = roster.filter((npc) => npc.pirateClass === pirateClass);
  assert(pirates.length > 0);
  const result = { wins: 0, losses: 0, unresolved: 0 };
  for (let seed = 1; seed <= trials; seed++) {
    result[trial(droneCount, pirateCount, pirates, seed)]++;
  }
  console.log(JSON.stringify({ droneCount, pirateCount, pirateClass, trials, ...result }));
}
