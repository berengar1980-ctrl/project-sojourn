'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const maps = load('src/data/boarding/boarding-maps.ts');
const geom = load('src/systems/boarding/boarding-geometry.ts');
const combat = load('src/systems/boarding/boarding-tactical-service.ts');
const profiles = load('src/systems/boarding/boarding-personal-profiles.ts');
const wreckRules = load('src/systems/salvage/salvage-boarding-rules.ts');
const aftermath = load('src/systems/boarding/boarding-afteraction.ts');

const sections = {
  'corridor-complex': 'wreck-corridors',
  'double-deck': 'wreck-double-deck',
  'engine-room': 'wreck-engine',
  'cargo-bay': 'wreck-cargo',
  'crew-quarters': 'wreck-quarters',
  bridge: 'wreck-bridge',
  'reactor-hall': 'wreck-reactor',
  medbay: 'wreck-medbay',
};

function canCross(map, from, to) {
  const doorStates = Object.fromEntries(map.doors.map((door) => [door.id, true]));
  const visited = new Set([geom.boardingHexKey(from.q, from.r)]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift();
    if (here.q === to.q && here.r === to.r) return true;
    for (const hex of geom.boardingHexNeighbours(map, here)) {
      const key = geom.boardingHexKey(hex.q, hex.r);
      if (!visited.has(key) && !geom.boardingHexBlocked(map, doorStates, hex.q, hex.r)) {
        visited.add(key);
        queue.push(hex);
      }
    }
  }
  return false;
}

{
  const topologies = new Set();
  for (const [variant, id] of Object.entries(sections)) {
    const wreck = { sectionVariant: variant, inspected: true, boardingHostiles: 3 };
    assert.equal(wreckRules.boardingMapForWreck(wreck), id);
    assert.match(wreckRules.boardingBriefingForWreck(wreck), /Verteidiger: 3/);
    const map = maps.boardingMapById(id);
    assert(map, 'known map: ' + id);
    assert.equal(map.rows, 7);
    assert.equal(map.columns, 9);
    assert(map.walls.length > 0, 'every interior has physical obstacles');
    assert(canCross(map, { q: 0, r: 1 }, { q: 8, r: 1 }), 'connected deck: ' + id);
    assert(map.doors.every((door) => !map.walls.includes(geom.boardingHexKey(door.q, door.r))));
    assert(map.cover.every((edge) => !map.walls.includes(geom.boardingHexKey(edge.q, edge.r))));
    assert.equal(new Set(map.doors.map((door) => door.id)).size, map.doors.length);
    topologies.add([...map.walls].sort().join('|'));
  }
  assert.equal(topologies.size, 8, 'all eight wreck interiors must have distinct topology');
}

function combatTemplate(id, team, weapon, hp = 18) {
  return {
    id,
    name: id,
    team,
    hp,
    maxHp: hp,
    rangedSkill: 80,
    meleeSkill: 40,
    weapon,
  };
}

function coneEncounter() {
  const flamer = profiles.personalRangedProfile('flamer');
  const rifle = profiles.personalRangedProfile('lasgun');
  const make = () =>
    combat.createBoardingTacticalService({
      seed: 73,
      mapId: 'long-corridor',
      playerUnits: [
        combatTemplate('flame', 'player', flamer),
        combatTemplate('mate', 'player', rifle),
      ],
      enemyUnits: [
        combatTemplate('raider-a', 'enemy', rifle),
        combatTemplate('raider-b', 'enemy', rifle),
        combatTemplate('raider-behind', 'enemy', rifle),
      ],
    });
  const initial = structuredClone(make().getSnapshot());
  const positions = {
    flame: [2, 1],
    mate: [3, 1],
    'raider-a': [4, 1],
    'raider-b': [5, 1],
    'raider-behind': [4, 3],
  };
  for (const unit of initial.units) {
    [unit.q, unit.r] = positions[unit.id];
  }
  return combat.createBoardingTacticalService({
    seed: 73,
    mapId: 'long-corridor',
    playerUnits: [],
    enemyUnits: [],
    restore: initial,
  });
}

{
  const attack = coneEncounter();
  const before = attack.getSnapshot();
  assert.equal(before.randomCalls, 0);
  const result = attack.fireCone('flame', { q: 5, r: 1 });
  assert(result);
  assert.deepEqual(
    result.map((hit) => hit.targetId),
    ['mate', 'raider-a', 'raider-b'],
    'cone strikes allies as well as enemies, but not through the corridor wall'
  );
  assert.equal(attack.getSnapshot().randomCalls, 3, 'one independent roll per victim');
  assert.equal(attack.getSnapshot().units.find((u) => u.id === 'flame').rangedActions, 1);
  assert.equal(attack.getSnapshot().units.find((u) => u.id === 'flame').ap, 2);
  assert.equal(attack.fireCone('flame', { q: 5, r: 1 }), null, 'no second attack');
  const recreated = coneEncounter();
  assert.deepEqual(recreated.fireCone('flame', { q: 5, r: 1 }), result, 'deterministic cone');
}

{
  const flamer = profiles.personalRangedProfile('flamer');
  const rifle = profiles.personalRangedProfile('lasgun');
  const make = () =>
    combat.createBoardingTacticalService({
      seed: 16,
      mapId: 'bulkhead-door',
      playerUnits: [combatTemplate('flame', 'player', flamer)],
      enemyUnits: [combatTemplate('enemy', 'enemy', rifle)],
    });
  const snapshot = structuredClone(make().getSnapshot());
  snapshot.units.find((unit) => unit.id === 'flame').q = 3;
  snapshot.units.find((unit) => unit.id === 'flame').r = 3;
  snapshot.units.find((unit) => unit.id === 'enemy').q = 5;
  snapshot.units.find((unit) => unit.id === 'enemy').r = 3;
  const tactical = combat.createBoardingTacticalService({
    seed: 16, mapId: 'bulkhead-door', playerUnits: [], enemyUnits: [], restore: snapshot,
  });
  assert.equal(tactical.fireCone('flame', { q: 5, r: 3 }), null, 'closed bulkhead protects corridor');
  assert.equal(tactical.openDoor('flame', 'door-4-3'), true);
  const hits = tactical.fireCone('flame', { q: 5, r: 3 });
  assert(hits && hits.some((entry) => entry.targetId === 'enemy'));
}

{
  const rifle = profiles.personalRangedProfile('lasgun');
  const setup = () => combat.createBoardingTacticalService({
    seed: 55, mapId: 'long-corridor',
    playerUnits: [
      combatTemplate('sentry', 'player', rifle),
      combatTemplate('ally', 'player', rifle),
    ],
    enemyUnits: [combatTemplate('intruder', 'enemy', rifle)],
  });
  const saved = structuredClone(setup().getSnapshot());
  saved.activeTeam = 'enemy';
  for (const unit of saved.units) {
    const q = { sentry: 2, ally: 3, intruder: 7 }[unit.id];
    unit.q = q;
    unit.r = 1;
    if (unit.id === 'sentry') {
      unit.overwatch = true;
      unit.overwatchTarget = { q: 5, r: 1 };
    }
  }
  const blocked = combat.createBoardingTacticalService({
    seed: 55, mapId: 'long-corridor',
    playerUnits: [], enemyUnits: [], restore: saved,
  });
  assert(blocked.move('intruder', { q: 5, r: 1 }));
  assert.equal(
    blocked.getSnapshot().units.find((unit) => unit.id === 'sentry').rangedActions,
    0,
    'overwatch must not shoot through its own squad'
  );
  const suppressed = structuredClone(saved);
  suppressed.units.find((unit) => unit.id === 'ally').hp = 0;
  suppressed.units.find((unit) => unit.id === 'sentry').suppressed = true;
  const pinned = combat.createBoardingTacticalService({
    seed: 55, mapId: 'long-corridor',
    playerUnits: [], enemyUnits: [], restore: suppressed,
  });
  assert(pinned.move('intruder', { q: 5, r: 1 }));
  assert.equal(pinned.getSnapshot().units.find((unit) => unit.id === 'sentry').rangedActions, 0);
  assert.equal(pinned.getSnapshot().units.find((unit) => unit.id === 'sentry').overwatch, false);
}

{
  const wreck = {
    id: 'section-test',
    inspected: true,
    boardingHostiles: 3,
    boardingCleared: false,
  };
  assert(wreckRules.wreckCanBoard(wreck));
  const snap = coneEncounter().getSnapshot();
  const retreated = {
    ...snap,
    outcome: 'retreat',
    units: snap.units.map((unit) =>
      unit.id === 'raider-a' ? { ...unit, hp: 0 } : unit
    ),
  };
  const first = wreckRules.recordWreckBoardingOutcome(wreck, retreated);
  assert.deepEqual(first, { defeated: 1, remaining: 2, secured: false });
  assert.equal(wreck.boardingAttempts, 1);
  assert.equal(wreckRules.wreckDefenderCount(wreck), 2);
  assert(wreckRules.wreckCanBoard(wreck), 'a retreat never unlocks salvage');
  const second = wreckRules.recordWreckBoardingOutcome(wreck, {
    ...retreated,
    outcome: 'player_win',
    units: retreated.units.filter((unit) => unit.team === 'player' || unit.id !== 'raider-behind')
      .map((unit) => unit.team === 'enemy' ? { ...unit, hp: 0 } : unit),
  });
  assert.deepEqual(second, { defeated: 2, remaining: 0, secured: true });
  assert.equal(wreck.boardingAttempts, 2);
  assert.equal(wreckRules.wreckCanBoard(wreck), false);
}

{
  const snapshot = coneEncounter().getSnapshot();
  const fallen = {
    ...snapshot,
    outcome: 'retreat',
    units: snapshot.units.map((unit) => {
      if (unit.id === 'flame') return { ...unit, hp: 0 };
      if (unit.id === 'mate') return { ...unit, hp: 12 };
      if (unit.id === 'raider-a') return { ...unit, hp: 0 };
      return unit;
    }),
  };
  const resolution = aftermath.boardingAfterAction(fallen, 'wreck', 'section-test');
  assert.deepEqual(resolution.event, {
    type: 'boarding.ended',
    outcome: 'draw',
    source: 'wreck',
    crewIncapacitated: 1,
    crewWounded: 1,
    enemiesDefeated: 1,
    wreckId: 'section-test',
  });
  assert.match(resolution.report, /1 VERWUNDETE/);
}

const app = fs.readFileSync(path.join(root, 'src/app/game-controller-events.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/boarding/boarding-tactical-panel.ts'), 'utf8');
assert(app.includes('recordWreckBoardingOutcome(wreck, snapshot)'));
assert(app.includes('wreckDefenderCount(wreck)'));
assert(panel.includes('this.tactical.fireCone'));
assert(panel.includes('this.options.missionBriefing'));
console.log('PASS eight navigable wreck decks, flamer friendlies and cover, suppressed overwatch, persistent casualties, campaign aftermath');
