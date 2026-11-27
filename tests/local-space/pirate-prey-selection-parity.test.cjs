'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { LocalPirateTraffic } = load('src/systems/npcs/npc-local-pirate-service.ts');
const { rivalPirateGroups, npcMayTargetNpc } = load('src/systems/npcs/npc-combat-ai.ts');
const traffic = new LocalPirateTraffic(4400, 2700, 42);
const actor = { id: 'actor', pirate: true, job: 'pirate', factionId: 'a', hullHp: 100 };
const rival = { ...actor, id: 'rival', factionId: 'b' };
const freighter = { id: 'freighter', job: 'freighter', cargo: { ore: 2 }, hullHp: 100 };
const npcs = [actor, rival, freighter];
for (const npc of npcs) {
  traffic.ships.set(npc.id, {
    npcId: npc.id,
    position: { x: npc === actor ? 0 : 100, y: 0 },
    headingRadians: 0,
    speed: 0,
    awaitingCombat: false,
  });
}
const pirate = traffic.ships.get(actor.id);
const miners = [{ npcId: 'worker', position: { x: 100, y: 0 } }];
const player = { x: 100, y: 0 };
function reference() {
  const rivals = traffic.snapshot(
    npcs.filter((npc) => rivalPirateGroups(actor, npc) && npcMayTargetNpc(actor, npc))
  );
  const freighters = traffic.snapshot(
    npcs.filter(
      (npc) =>
        npc.job === 'freighter' &&
        npcMayTargetNpc(actor, npc) &&
        npc.smugglingProtectionFaction !== actor.factionId &&
        Object.values(npc.cargo).some((amount) => amount > 0)
    )
  );
  const targets = [
    ...rivals.map((npc) => ({ id: npc.npcId, position: npc.position })),
    ...freighters.map((npc) => ({ id: npc.npcId, position: npc.position })),
    ...miners
      .filter((miner) => !miner.inCombat)
      .map((miner) => ({
        id: miner.npcId,
        position: miner.position,
      })),
    { id: 'player', position: player },
  ];
  const distance = (target) =>
    Math.hypot(target.position.x - pirate.position.x, target.position.y - pirate.position.y);
  return targets.sort((a, b) => distance(a) - distance(b))[0];
}
function compare() {
  assert.deepEqual(traffic.nearestPrey(pirate, actor, npcs, miners, player), reference());
}
compare();
assert.equal(reference().id, 'rival');
rival.hullHp = 0;
compare();
assert.equal(reference().id, 'freighter');
freighter.smugglingProtectionFaction = 'a';
compare();
assert.equal(reference().id, 'worker');
miners[0].inCombat = true;
compare();
assert.equal(reference().id, 'player');
rival.hullHp = 100;
traffic.ships.get(rival.id).position = { x: 200, y: 0 };
compare();
console.log('PASS local pirate prey selection preserves target eligibility and stable ties');
