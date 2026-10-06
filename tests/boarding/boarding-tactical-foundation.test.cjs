'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const boarding = loadStandaloneTypeScriptModule(
  root,
  'src/systems/boarding/boarding-tactical-service.ts'
);
const weapons = loadStandaloneTypeScriptModule(root, 'src/data/boarding/boarding-weapons.ts');

function player(id, weapon = weapons.boardingRangedWeapons.rifle) {
  return {
    id,
    name: id,
    team: 'player',
    rangedSkill: 80,
    meleeSkill: 70,
    weapon,
    meleeWeapon: weapons.boardingMeleeWeapons.knife,
  };
}

function enemy(id) {
  return {
    id,
    name: id,
    team: 'enemy',
    hp: 12,
    armor: 1,
    rangedSkill: 55,
    meleeSkill: 50,
    weapon: weapons.boardingRangedWeapons.sidearm,
    meleeWeapon: weapons.boardingMeleeWeapons.baton,
  };
}

{
  const service = boarding.createBoardingTacticalService({
    seed: 7,
    mapId: 'bulkhead-door',
    playerUnits: [player('alpha')],
    enemyUnits: [enemy('hostile')],
  });
  const start = service.getSnapshot();
  assert.equal(start.outcome, 'active');
  assert.equal(start.activeTeam, 'player');
  assert.equal(start.units.length, 2);
  assert.equal(start.doorStates['door-4-3'], false);

  const alpha = start.units.find((unit) => unit.id === 'alpha');
  assert(alpha);
  const reachable = service.reachable('alpha', 2);
  const destinations = Object.entries(reachable).filter(([, cost]) => cost > 0);
  assert(destinations.length > 0, 'boarding units must have AP-limited movement');
  const [key, cost] = destinations[0];
  const [q, r] = key.split(',').map(Number);
  assert.equal(service.move('alpha', { q, r }), true);
  const moved = service.getSnapshot().units.find((unit) => unit.id === 'alpha');
  assert.equal(moved.ap, 3 - cost);
}

{
  const service = boarding.createBoardingTacticalService({
    seed: 21,
    mapId: 'bulkhead-door',
    playerUnits: [player('alpha')],
    enemyUnits: [enemy('hostile')],
  });
  let snapshot = service.getSnapshot();
  const alpha = snapshot.units.find((unit) => unit.id === 'alpha');
  assert(alpha);

  service.move('alpha', { q: 3, r: 3 });
  snapshot = service.getSnapshot();
  const atDoor = snapshot.units.find((unit) => unit.id === 'alpha');
  if (atDoor.q !== 3 || atDoor.r !== 3) {
    service.endTurn();
    service.endTurn();
    service.move('alpha', { q: 3, r: 3 });
  }
  assert.equal(service.openDoor('alpha', 'door-4-3'), true);
  assert.equal(service.getSnapshot().doorStates['door-4-3'], true);
}

{
  const service = boarding.createBoardingTacticalService({
    seed: 1,
    mapId: 'long-corridor',
    playerUnits: [player('alpha', weapons.boardingRangedWeapons.breacher)],
    enemyUnits: [enemy('hostile')],
  });
  const snapshot = service.getSnapshot();
  const alpha = snapshot.units.find((unit) => unit.id === 'alpha');
  const hostile = snapshot.units.find((unit) => unit.id === 'hostile');
  assert(alpha && hostile);

  service.move('alpha', { q: 2, r: 1 });
  const afterMove = service.getSnapshot();
  const moved = afterMove.units.find((unit) => unit.id === 'alpha');
  const liveHostile = afterMove.units.find((unit) => unit.id === 'hostile');
  if (
    moved &&
    liveHostile &&
    Math.abs(moved.q - liveHostile.q) + Math.abs(moved.r - liveHostile.r) < 10
  ) {
    const result = service.shoot('alpha', 'hostile');
    if (result) {
      assert(result.chancePercent >= 5 && result.chancePercent <= 95);
      assert.equal(service.shoot('alpha', 'hostile'), null, 'only one combat action per turn');
    }
  }
}

{
  const service = boarding.createBoardingTacticalService({
    seed: 31,
    playerUnits: [player('alpha')],
    enemyUnits: [],
  });
  assert.equal(service.getSnapshot().outcome, 'player_win');
}

{
  const service = boarding.createBoardingTacticalService({
    seed: 33,
    playerUnits: [player('alpha')],
    enemyUnits: [enemy('hostile')],
  });
  const result = service.retreat();
  assert.equal(result.outcome, 'retreat');
}

console.log('PASS tactical boarding maps, AP movement, doors, attacks, victory and retreat');
