'use strict';

const assert = require('node:assert/strict');

function createNpcLossAudit(ships) {
  const byId = new Map(ships.map((ship) => [ship.id, ship]));
  const scheduled = new Map();
  const observed = new Map();
  const wrecks = new Map();
  const byGeneration = new Map();
  const drone = (id) => id.startsWith('security-drone:');
  const keyFor = (ship) => JSON.stringify([ship.id, ship.replacementGeneration ?? 0]);

  function observePopulation(population) {
    const schedule = population.scheduleDefeated.bind(population);
    population.scheduleDefeated = (npc, day) => {
      const accepted = schedule(npc, day);
      if (accepted) {
        const key = keyFor(npc);
        assert(!scheduled.has(key), 'duplicate accepted retirement ' + key);
        scheduled.set(key, { id: npc.id, role: npc.job, day });
      }
      return accepted;
    };
  }

  function observeWrecks(losses, created, locationId) {
    const destroyed = losses.filter((ship) => ship.hullHp <= 0);
    for (const ship of destroyed) {
      const npc = byId.get(ship.id);
      if (npc && !drone(ship.id)) observed.set(keyFor(npc), ship.id);
    }
    for (const wreck of created) {
      const matches = destroyed.filter((ship) => wreck.id.endsWith('-' + ship.id));
      assert.equal(matches.length, 1, 'wreck must identify exactly one reported destroyed ship');
      const id = matches[0].id;
      const npc = byId.get(id);
      assert(npc, 'unknown NPC in wreck callback: ' + id);
      const previous = wrecks.get(wreck.id);
      if (previous) {
        previous.reports++;
        continue;
      }
      const key = drone(id) ? null : keyFor(npc);
      wrecks.set(wreck.id, { id, key, locationId, reports: 1 });
      if (key !== null) {
        const ids = byGeneration.get(key) ?? [];
        ids.push(wreck.id);
        byGeneration.set(key, ids);
      }
    }
  }

  function report(population, registeredWrecks) {
    const scheduledWithoutWreck = [...scheduled.keys()].filter((key) => !byGeneration.has(key));
    const observedWithoutWreck = [...observed.keys()].filter((key) => !byGeneration.has(key));
    const wreckWithoutRetirement = [...byGeneration.keys()].filter((key) => !scheduled.has(key));
    const multipleWrecks = [...byGeneration.entries()].filter(([, ids]) => ids.length > 1);
    const outstanding = population.outstanding;
    assert.equal(
      scheduled.size,
      population.replacementCount + outstanding,
      'accepted retirements must equal replaced plus outstanding ships'
    );
    const locations = new Set([...wrecks.values()].map((wreck) => wreck.locationId));
    const activeIds = new Set();
    if (registeredWrecks) {
      for (const locationId of locations) {
        for (const wreck of registeredWrecks(locationId)) {
          assert(wrecks.has(wreck.id), 'untracked registered combat wreck: ' + wreck.id);
          activeIds.add(wreck.id);
        }
      }
    }
    const roles = {};
    for (const loss of scheduled.values()) roles[loss.role] = (roles[loss.role] ?? 0) + 1;
    const pending = new Set(
      ships
        .filter((ship) => !drone(ship.id) && ship.hullHp <= 0 && ship.retiredUntilDay === undefined)
        .map(keyFor)
    );
    return {
      scheduledLosses: scheduled.size,
      replacements: population.replacementCount,
      outstanding,
      lossesByRole: roles,
      observedDestroyedGenerations: observed.size,
      uniqueWrecks: wrecks.size,
      activeWrecks: activeIds.size,
      removedWrecks: wrecks.size - activeIds.size,
      droneWrecks: [...wrecks.values()].filter((wreck) => drone(wreck.id)).length,
      repeatedWreckReports: [...wrecks.values()].reduce((sum, wreck) => sum + wreck.reports - 1, 0),
      scheduledWithoutWreck: registeredWrecks ? scheduledWithoutWreck.length : null,
      observedWithoutWreck: registeredWrecks ? observedWithoutWreck.length : null,
      wreckWithoutRetirement: registeredWrecks ? wreckWithoutRetirement.length : null,
      wreckAwaitingRetirement: wreckWithoutRetirement.filter((key) => pending.has(key)).length,
      multipleWrecksForGeneration: multipleWrecks.length,
      examples: {
        scheduledWithoutWreck: registeredWrecks ? scheduledWithoutWreck.slice(0, 12) : [],
        observedWithoutWreck: observedWithoutWreck.slice(0, 12),
        wreckWithoutRetirement: wreckWithoutRetirement.slice(0, 12),
        multipleWrecks: multipleWrecks.slice(0, 12),
      },
    };
  }

  return { observePopulation, observeWrecks, report };
}

module.exports = { createNpcLossAudit };
