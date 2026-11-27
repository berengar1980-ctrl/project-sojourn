'use strict';

const assert = require('node:assert/strict');
const { createNpcLossAudit } = require('./npc-loss-audit.cjs');

const miner = { id: 'npc-01', job: 'miner', hullHp: 0 };
const pirate = { id: 'npc-02', job: 'pirate', hullHp: 0 };
const drone = { id: 'security-drone:a', hullHp: 0 };
const ships = [miner, pirate, drone];
const population = {
  replacementCount: 0,
  outstanding: 0,
  scheduleDefeated(npc, day) {
    if (npc.retiredUntilDay !== undefined) return false;
    npc.retiredUntilDay = day + 5;
    this.outstanding++;
    return true;
  },
};
const audit = createNpcLossAudit(ships);
audit.observePopulation(population);
const wreck = { id: 'combat-wreck-a-npc-01' };
const droneWreck = { id: 'combat-wreck-a-security-drone:a' };
audit.observeWrecks([miner, drone], [wreck, droneWreck], 'a');
audit.observeWrecks([miner], [wreck], 'a');
population.scheduleDefeated(miner, 1);
assert.equal(population.scheduleDefeated(miner, 2), false);
population.scheduleDefeated(pirate, 1);
let result = audit.report(population, () => [wreck, droneWreck]);
assert.equal(result.scheduledLosses, 2);
assert.equal(result.uniqueWrecks, 2);
assert.equal(result.droneWrecks, 1);
assert.equal(result.repeatedWreckReports, 1);
assert.equal(result.scheduledWithoutWreck, 1);
assert.equal(result.wreckWithoutRetirement, 0);
assert.equal(result.multipleWrecksForGeneration, 0);
delete miner.retiredUntilDay;
miner.replacementGeneration = 1;
population.outstanding--;
population.replacementCount++;
const nextWreck = { id: 'combat-wreck-b-npc-01' };
audit.observeWrecks([miner], [nextWreck], 'b');
result = audit.report(population, (id) => (id === 'b' ? [nextWreck] : []));
assert.equal(result.removedWrecks, 2);
assert.equal(result.wreckAwaitingRetirement, 1);
population.scheduleDefeated(miner, 6);
const duplicate = { id: 'combat-wreck-duplicate-npc-01' };
audit.observeWrecks([miner], [duplicate], 'b');
result = audit.report(population, (id) => (id === 'b' ? [nextWreck, duplicate] : []));
assert.equal(result.scheduledLosses, 3);
assert.equal(result.multipleWrecksForGeneration, 1);
assert.equal(result.wreckWithoutRetirement, 0);
assert.equal(result.lossesByRole.miner, 2);
console.log(
  'PASS loss audit reconciles generations, fleet wrecks, duplicates and pending retirement'
);
