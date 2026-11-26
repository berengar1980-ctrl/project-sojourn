'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const profiling = process.env.SOJOURN_PROFILE === '1';
const profileStarted = performance.now();
const profileCpu = process.cpuUsage();
const timings = new Map();

function profile(name, work) {
  if (!profiling) return work;
  return (...args) => {
    const started = performance.now();
    try {
      return work(...args);
    } finally {
      const entry = timings.get(name) ?? { calls: 0, totalMs: 0, maxMs: 0 };
      const elapsed = performance.now() - started;
      entry.calls += 1;
      entry.totalMs += elapsed;
      entry.maxMs = Math.max(entry.maxMs, elapsed);
      timings.set(name, entry);
    }
  };
}

function printProgress(day, days, setupMs) {
  const cpu = process.cpuUsage(profileCpu);
  const memory = process.memoryUsage();
  console.error(
    '[economy-profile] ' +
      JSON.stringify({
        day,
        days,
        setupMs: Math.round(setupMs),
        wallMs: Math.round(performance.now() - profileStarted),
        cpuMs: Math.round((cpu.user + cpu.system) / 1000),
        rssMiB: Math.round(memory.rss / 1048576),
        heapUsedMiB: Math.round(memory.heapUsed / 1048576),
        timings: [...timings.entries()]
          .map(([name, entry]) => ({
            name,
            calls: entry.calls,
            totalMs: Math.round(entry.totalMs),
            maxMs: Number(entry.maxMs.toFixed(2)),
          }))
          .sort((a, b) => b.totalMs - a.totalMs),
      })
  );
}

const root = path.resolve(__dirname, '../..');
const load = (file, replacements) => loadStandaloneTypeScriptModule(root, file, replacements);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const simulationModule = load('src/systems/economy/economy-simulation-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { createNpcPopulationService } = load('src/systems/npcs/npc-population-service.ts');
const { transferPirateLoot } = load('src/systems/combat/npc-combatant-setup.ts');
const { createStarMapEngagementService } = load(
  'src/systems/combat/star-map-engagement-service.ts'
);
const { getShipDefinition } = load('src/systems/ships/ship-registry.ts');
const { createNpcSmugglingService } = load('src/systems/economy/npc-smuggling-service.ts');

const integrated = process.env.SOJOURN_INTEGRATED_FIELDS === '1';
const secondsPerDay = integrated ? 180 : 16;
const days = Number(process.env.SOJOURN_LONGRUN_DAYS ?? 90);
assert(Number.isInteger(days));
assert(days >= 1 && days <= 365);
const ships = createSectorNpcEconomyStates();
const isDrone = (ship) => ship.id.startsWith('security-drone:');
if (integrated) load('src/app/game-controller-economy.ts').registerSecurityDroneCombatants(ships);
const markets = createEconomyMarketService(sectorPorts, economyResources);
const player = { credits: 0, cargo: {} };
const physical = simulationModule.createEconomySimulationService(
  markets,
  player,
  economyResources,
  41,
  ships
);
const population = createNpcPopulationService(ships, markets, (id, units) => {
  const pool = physical.pools[id];
  if (pool) pool.recordedLosses += units;
});
const sector = createNpcSectorService(narrowsSector, ships, { markets, population });
const positions = {};
for (const location of narrowsSector.locations) {
  positions[location.id] = location.position;
}
// Reproducible inspection sampling: the long-run audit must not depend on Math.random.
let rng = 0x286;
const nextRandom = () => {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  return rng / 0x100000000;
};
const recordConfiscation = (id, amount) => {
  const pool = physical.pools[id];
  if (pool) pool.recordedLosses += amount;
};
const smuggling = createNpcSmugglingService(
  ships,
  sector,
  () => {},
  nextRandom,
  0,
  recordConfiscation
);
const economy = createNpcEconomyService(markets, physical, economyResources, ships, {
  onSale: (npc, resourceId, quantity, gross) => {
    smuggling.recordSale(npc, resourceId, quantity, gross);
    population.collectTradeCommission(Math.max(0, Math.round((gross * 0.06) / 0.94)));
  },
  positions,
  isManaged: (npc) =>
    isDrone(npc) ||
    (integrated &&
      npc.role === 'miner' &&
      npc.workLocationId === npc.locationId &&
      npc.autonomy?.phase === 'working' &&
      narrowsSector.locations.some(
        (entry) => entry.id === npc.locationId && entry.activities.mine
      )),
  travel: {
    requestTravel: (npc, destination, reason) => sector.requestTravel(npc, destination, reason),
    requestPatrol: (npc) => sector.requestPatrol(npc),
    isTravelling: (npc) => sector.isTravelling(npc),
    quoteTravel: (npc, destination, credits) => sector.quoteTravel(npc, destination, credits),
  },
});

const { createIntegratedFieldAudit } = require('./integrated-field-audit.cjs');
const fieldAudit = integrated
  ? createIntegratedFieldAudit(load, narrowsSector, physical, economy, sector, player, profile)
  : null;

const combatStats = {
  encounters: 0,
  resolved: 0,
};
const combatLog = (message) => {
  if (message.startsWith('NPC COMBAT > KONTAKT')) combatStats.encounters += 1;
  else if (message.startsWith('NPC COMBAT > ') && !message.includes('VERFOLGT')) {
    combatStats.resolved += 1;
  }
};
const engagements = createStarMapEngagementService({
  navigation: {
    getSnapshot: () => ({
      isTravelling: false,
      isPursuing: false,
      currentPosition: { x: -99999, y: -99999 },
    }),
  },
  sectorNpcs: sector,
  ...(integrated ? { world: () => narrowsSector } : {}),
  getPlayerShip: () => getShipDefinition(ships[0].shipId),
  getPlayerCombatant: () => {
    throw new Error('Player combat is excluded from this NPC-only audit');
  },
  log: combatLog,
  ...(fieldAudit ? { onNpcCombatEnded: fieldAudit.combatEnded, ...fieldAudit.hooks } : {}),
});

fieldAudit?.bindEngagements(engagements);

const initial = {};
const activity = {};
const lastRuns = {};
const lastGeneration = {};
const completedLegs = {};
const bankruptDays = {};
for (const ship of ships) {
  initial[ship.id] = { credits: ship.credits, runs: ship.successfulRuns };
  activity[ship.id] = 0;
  lastRuns[ship.id] = ship.successfulRuns;
  lastGeneration[ship.id] = ship.replacementGeneration ?? 0;
  completedLegs[ship.id] = 0;
  bankruptDays[ship.id] = 0;
}

function validate(day) {
  for (const ship of ships) {
    assert(Number.isFinite(ship.credits));
    assert(ship.credits >= 0, ship.id + ' has negative credits');
    assert(Number.isFinite(ship.fuel));
    assert(ship.fuel >= 0, ship.id + ' has negative fuel');
    assert(ship.fuel <= ship.fuelCapacity + 0.001);
    assert(ship.hullHp >= 0 && ship.hullHp <= ship.hullMaxHp);
    let units = 0;
    for (const amount of Object.values(ship.cargo)) {
      assert(Number.isFinite(amount) && amount >= 0);
      units += amount;
    }
    assert(units <= ship.cargoCapacity, ship.id + ' exceeds cargo capacity');
    if (ship.credits === 0) bankruptDays[ship.id] += 1;
    const generation = ship.replacementGeneration ?? 0;
    const previousRuns = generation === lastGeneration[ship.id] ? lastRuns[ship.id] : 0;
    const newLegs = Math.max(0, ship.successfulRuns - previousRuns);
    if (newLegs > 0) activity[ship.id] = day;
    completedLegs[ship.id] += newLegs;
    lastRuns[ship.id] = ship.successfulRuns;
    lastGeneration[ship.id] = generation;
  }
  for (const market of markets.snapshot()) {
    for (const entry of Object.values(market.entries)) {
      assert(Number.isFinite(entry.stock) && entry.stock >= 0);
      assert(Number.isFinite(entry.price) && entry.price > 0);
    }
  }
}

function workerStatus(ship) {
  return {
    id: ship.id,
    role: ship.job,
    locationId: ship.locationId,
    workLocationId: ship.workLocationId,
    phase: ship.autonomy?.phase,
    activity: ship.activityId,
    lastTravelDay: activity[ship.id],
    retiredUntilDay: ship.retiredUntilDay,
    fuel: ship.fuel,
    hull: ship.hullHp,
    credits: ship.credits,
    cargoUnits: Object.values(ship.cargo).reduce((total, units) => total + units, 0),
    cargoCapacity: ship.cargoCapacity,
    target: ship.travel?.finalTargetId,
  };
}

function printReport(elapsedDays) {
  const roles = ['freighter', 'miner', 'salvager', 'patrol', 'pirate'];
  const report = [];
  for (const role of roles) {
    const members = ships.filter((ship) => ship.job === role && !isDrone(ship));
    const sum = (fn) => members.reduce((total, ship) => total + fn(ship), 0);
    report.push({
      role,
      ships: members.length,
      startingCredits: sum((ship) => initial[ship.id].credits),
      finalCredits: sum((ship) => ship.credits),
      netCreditChange: sum((ship) => ship.credits - initial[ship.id].credits),
      completedLegs: sum((ship) => completedLegs[ship.id]),
      noTravel: members.filter((ship) => completedLegs[ship.id] === 0).length,
      inactive30Days: members.filter((ship) => elapsedDays - activity[ship.id] > 30).length,
      retired: members.filter((ship) => ship.retiredUntilDay !== undefined).length,
      zeroCreditDays: sum((ship) => bankruptDays[ship.id]),
      lowFuel: members.filter((ship) => ship.fuel < ship.fuelCapacity * 0.1).length,
      lootRevenue: sum((ship) => ship.pirateLootRevenue ?? 0),
      expenses: sum((ship) => ship.pirateOperatingExpenses ?? 0),
      civilianOperatingExpenses: sum((ship) => ship.civilianOperatingExpenses ?? 0),
      hullUpgrades: sum((ship) => ship.hullUpgradeCount ?? 0),
      replacements: sum((ship) => ship.replacementGeneration ?? 0),
      defeats: sum((ship) => ship.combatDefeats ?? 0),
      smugglingFines: sum((ship) => ship.smugglingFinesPaid ?? 0),
      smugglingConfiscated: sum((ship) => ship.smugglingConfiscated ?? 0),
      smugglingProtectionFees: sum((ship) => ship.smugglingProtectionFees ?? 0),
      unsoldCargoUnits: sum((ship) =>
        Object.values(ship.cargo).reduce((total, units) => total + units, 0)
      ),
    });
  }
  assert.equal(ships.filter((ship) => !isDrone(ship)).length, 33);
  assert.equal(report.find((group) => group.role === 'pirate').ships, 9);
  const workers = ships.filter((ship) => ship.job === 'miner' || ship.job === 'salvager');
  console.log(
    JSON.stringify({
      days: elapsedDays,
      automaticCombat: true,
      integratedFields: integrated,
      secondsPerDay,
      ...(fieldAudit ? { fieldActivity: { ...fieldAudit.stats } } : {}),
      combat: combatStats,
      smuggling: smuggling.stats,
      population: {
        replacementCount: population.replacementCount,
        outstanding: population.outstanding,
        insuranceFundCredits: population.fundCredits,
        externalFunding: population.externalFunding,
      },
      report,
      securityDrones: {
        count: ships.filter(isDrone).length,
        defeated: ships.filter(isDrone).reduce((sum, ship) => sum + (ship.combatDefeats ?? 0), 0),
        recovering: ships.filter((ship) => isDrone(ship) && ship.hullHp <= 0).length,
      },
      workerStatus: integrated ? workers.map(workerStatus) : [],
      resourceBalance: physical.getResourceBalance(),
    })
  );
}

const tickEconomy = profile('economy.tick', (dt) => economy.tick(dt));
const tickSector = profile('sector.tick', (dt) => sector.tick(dt));
const tickSmuggling = profile('smuggling.tick', (dt) => smuggling.tick(dt));
const tickCombat = profile('combat.tick', (dt) => engagements.tick(dt));
const tickFields = profile('fields.tick', (dt) => fieldAudit?.tick(dt));
const validateDay = profile('validate.day', validate);
const validateFields = profile('validate.fields', () => fieldAudit?.validate());
const setupMs = performance.now() - profileStarted;
if (profiling) printProgress(0, days, setupMs);

for (let day = 0; day < days; day += 1) {
  physical.advanceDay(day);
  fieldAudit?.beginDay(day);
  economy.advanceDay(day);
  sector.advanceDay(day);
  smuggling.advanceDay(day);
  fieldAudit?.balanceDay();
  if (day > 0) validateFields();
  for (let step = 0; step < secondsPerDay * 4; step += 1) {
    tickEconomy(0.25);
    tickSector(0.25);
    tickSmuggling(0.25);
    tickCombat(0.25);
    tickFields(0.25);
  }
  validateDay(day);
  if (profiling && ((day + 1) % 5 === 0 || day === 0 || day + 1 === days)) {
    printProgress(day + 1, days, setupMs);
  }
  if (integrated && [90, 180, 365].includes(day + 1) && day + 1 !== days) {
    printReport(day + 1);
  }
}

if (fieldAudit) {
  assert(fieldAudit.stats.minedUnits > 0, 'integrated NPC miners must extract physical ore');
  assert(fieldAudit.stats.recoveredUnits > 0, 'integrated NPC salvagers must recover real stock');
}
console.log('ECONOMY LONGRUN AUDIT');
printReport(days);
console.log('ECONOMY BY SHIP');
for (const ship of ships) {
  console.log(
    JSON.stringify({
      id: ship.id,
      role: ship.job,
      creditsStart: initial[ship.id].credits,
      creditsEnd: ship.credits,
      creditsDelta: ship.credits - initial[ship.id].credits,
      completedLegs: completedLegs[ship.id],
      fuel: ship.fuel,
      hull: ship.hullHp,
      lootRevenue: ship.pirateLootRevenue ?? 0,
      operatingExpenses: ship.pirateOperatingExpenses ?? 0,
      civilianOperatingExpenses: ship.civilianOperatingExpenses ?? 0,
      hullUpgrades: ship.hullUpgradeCount ?? 0,
      replacementGeneration: ship.replacementGeneration ?? 0,
      defeats: ship.combatDefeats ?? 0,
      smugglingFines: ship.smugglingFinesPaid ?? 0,
      smugglingConfiscated: ship.smugglingConfiscated ?? 0,
    })
  );
}

if (integrated) {
  console.log('PASS integrated physical fields and full-day NPC activity');
  process.exit(0);
}

// A scripted NPC raid checks conservation and one-time resale.
// This does not imply that automatic pirate combat is profitable.
const raidShips = createSectorNpcEconomyStates();
const pirate = raidShips.find((ship) => ship.pirate && ship.factionId === 'pirates');
const victim = raidShips.find((ship) => ship.job === 'freighter');
assert(pirate && victim);
const raidMarkets = createEconomyMarketService(sectorPorts, economyResources);
const raidSector = createNpcSectorService(narrowsSector, [pirate], { markets: raidMarkets });
const market = raidMarkets.getEntry('blackjaw-outpost', 'ferrite');
assert(market && market.stock >= 5);
market.stock -= 5;
for (const id of Object.keys(victim.cargo)) delete victim.cargo[id];
victim.cargo.ferrite = 5;
const stock = () => market.stock + (victim.cargo.ferrite ?? 0) + (pirate.cargo.ferrite ?? 0);
const before = stock();
assert.equal(transferPirateLoot(pirate, victim), 5);
assert.equal(pirate.cargo.ferrite, 5);
pirate.locationId = 'blackjaw-outpost';
delete pirate.travel;
delete pirate.combatMovement;
const revenueBefore = pirate.pirateLootRevenue ?? 0;
raidSector.tick(0.25);
assert.equal(stock(), before, 'pirate trade must conserve physical goods');
assert.equal(pirate.cargo.ferrite, undefined);
assert((pirate.pirateLootRevenue ?? 0) > revenueBefore);
const revenueAfter = pirate.pirateLootRevenue;
raidSector.tick(0.25);
assert.equal(pirate.pirateLootRevenue, revenueAfter, 'no duplicate sales');
assert.equal(stock(), before, 'second tick must not duplicate physical goods');
console.log(
  'PASS ' + days + '-day combat- and smuggling-enabled economic integrity and pirate loot resale'
);
