'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const safety = loadStandaloneTypeScriptModule(root, 'src/systems/navigation/route-safety.ts');
const pirates = loadStandaloneTypeScriptModule(root, 'src/systems/npcs/npc-pirate-classes.ts');

const haven = {
  id: 'haven',
  position: { x: 100, y: 100 },
  radius: 38,
  kind: 'planet',
  stationType: undefined,
  dangerLevel: 0,
  activities: { dock: true, refuel: true },
};
const pirateBase = {
  id: 'corsair',
  position: { x: 900, y: 100 },
  radius: 20,
  kind: 'station',
  stationType: 'pirate',
  dangerLevel: 3,
  activities: { dock: true, refuel: true },
};
const world = { regions: [], locations: [haven, pirateBase] };
assert(safety.safeDestinationRadius(haven) >= 130);
assert.equal(safety.safeDestinationRadius(pirateBase), 0);
assert(safety.protectedBySafeDestination(world, { x: 145, y: 100 }));
assert(!safety.protectedBySafeDestination(world, pirateBase.position));

const route = {
  fromId: 'a',
  toId: 'b',
  profile: 'safe',
  dangerLevel: 3,
  distance: 1100,
  points: [
    { x: 0, y: 0 },
    { x: 1100, y: 0 },
  ],
};
const pirateContact = { position: { x: 600, y: 0 }, kind: 'pirate', strength: 1 };
const rookie = safety.assessRouteRisk(route, [pirateContact], {
  hull: 65,
  shield: 60,
  piloting: 10,
  sensors: 10,
});
const veteran = safety.assessRouteRisk(route, [pirateContact], {
  hull: 290,
  shield: 290,
  piloting: 95,
  sensors: 95,
});
assert(veteran.score < rookie.score, 'stronger hull and assigned crew must lower personal risk');
assert.equal(route.dangerLevel, 3, 'personal risk must never recolor the geographic region');
assert(
  safety.assessRouteRisk(route, [pirateContact], {
    hull: 90,
    shield: 90,
    piloting: 25,
    sensors: 25,
  }).score >
    safety.assessRouteRisk(route, [], {
      hull: 90,
      shield: 90,
      piloting: 25,
      sensors: 25,
    }).score
);
for (const [cls, minimum] of [
  ['raider', 0],
  ['reaver', 2],
  ['marauder', 3],
]) {
  const npc = { pirate: true, pirateClass: cls };
  for (let level = 0; level <= 3; level += 1) {
    assert.equal(
      pirates.canPirateOperateAt(npc, level),
      level >= minimum,
      cls + ' must obey the fixed zone threshold'
    );
  }
}
assert.notEqual(pirates.PIRATE_CLASS_SHIPS.raider, pirates.PIRATE_CLASS_SHIPS.marauder);
console.log(
  'PASS fixed zones, separate ship-relative risk, protected civilian rings and pirate classes'
);
