'use strict';

/**
 * Read-only, matched-weapon civilian role audit on the production duel engine.
 * In the "normalized" arm only mobility, shields, hull and accuracy are
 * normalized; geometry, mount facings and ship role remain genuinely different.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');
const { postStatus } = require('./ci-run-and-report.cjs');

const root = path.resolve(__dirname, '..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const { duelCombatant, duelInstalledComponents } = load('src/ui/start/duel-combatant-setup.ts');
const { calculateShipModeEnergy } = load('src/systems/ships/ship-component-service.ts');
const { createDuelArena } = load('src/systems/combat/duel-arena-presets.ts');
const { weaponInArc } = load('src/systems/combat/combat-weapon-geometry.ts');
const { fitsWeaponHardpoint } = load('src/systems/ships/ship-loadout-service.ts');
const { crewDefinitions } = load('src/data/crew/crew-definitions.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');

const ships = getAllShipDefinitions();
const seeds = [1811, 2311, 3011, 4099];
const pairs = [
  ['patrol', 'mining'],
  ['patrol', 'salvage'],
  ['patrol', 'freighter'],
  ['mining', 'salvage'],
  ['patrol', 'patrol'],
  ['mining', 'mining'],
];
const kits = {
  bow: ['railgun', null, null],
  broadside: [null, 'plasma_battery', 'autocannon'],
  all: ['railgun', 'plasma_battery', 'autocannon'],
};
const modes = ['native', 'normalized'];
const step = 0.08;
const limit = 90;
const sampleEvery = 8;
const roleVariant = { patrol: 1, mining: 1, salvage: 3, freighter: 1 };

function selectShip(role) {
  const variants = ships.filter((ship) => ship.role === role);
  const ship = variants[roleVariant[role] - 1];
  assert(ship, 'Missing comparison ship for role ' + role);
  return ship;
}

function weaponFor(ship, slotIndex, family) {
  if (!family) return '';
  const slot = ship.sprite.hardpoints.weaponMounts.find(
    (entry) => entry.slotIndex === slotIndex
  );
  assert(slot, 'Expected combat weapon mount at ' + slotIndex);
  const component = SHIP_COMPONENT_CATALOG.weapon.find(
    (entry) => entry.weapon?.family === family &&
      entry.tier === 2 &&
      fitsWeaponHardpoint(ship, slotIndex, entry.weapon)
  );
  assert(component, 'Cannot mount ' + family + ' on ' + ship.role);
  return component.id;
}

function createSetup(role, kit, index, mode) {
  const ship = selectShip(role);
  const weapons = kit.map((family, slot) => weaponFor(ship, slot, family));
  const draft = {
    shipId: ship.id, weapons, mines: [], crewId: crewDefinitions[0].id,
    reactorId: 'reactor1',
  };
  const demand = calculateShipModeEnergy(duelInstalledComponents(draft)).combat;
  const reactor = SHIP_COMPONENT_CATALOG.reactor.find((part) => part.output >= demand);
  assert(reactor, 'Insufficient reactor in normalized research loadout');
  draft.reactorId = reactor.id;
  const setup = duelCombatant(index, draft, ship);
  assert.equal(setup.weapons.length, kit.filter(Boolean).length, 'Expected installed weapon count');
  const fixed = {
    ...setup,
    id: role + '-' + index,
    name: role,
    hitChance: 0.8,
    dodgeChance: 0.05,
    damageMultiplier: 1,
    cycleTimeMultiplier: 1,
    criticalChance: 0,
    preferredTactic: 'fight',
  };
  if (mode === 'native') return fixed;
  return {
    ...fixed,
    shieldHp: 180,
    hullHp: 240,
    combatSpeed: 115,
    turnRateRadiansPerSecond: 0.7,
    accelerationMetersPerSecond2: 32,
  };
}

function observe(side, target, ownSetup, metrics) {
  const gap = Math.hypot(side.position.x - target.position.x, side.position.y - target.position.y);
  const ready = [];
  const inRange = [];
  const inArc = [];
  ownSetup.weapons.forEach((component, index) => {
    if (!component.weapon) return;
    if (gap > component.weapon.rangeMeters) return;
    inRange.push(index);
    if (!weaponInArc({ ...side, setup: ownSetup }, target.position, index, component.weapon)) return;
    inArc.push(index);
    if (side.weaponTelemetry[index].cooldownRemaining <= step) ready.push(index);
  });
  if (inRange.length) metrics.inRange += 1;
  if (inArc.length) metrics.arc += 1;
  if (ready.length) metrics.ready += 1;
  if (side.strategy?.phase === 'align_weapons') metrics.align += 1;
  if (side.strategy?.phase === 'reach_range') metrics.approach += 1;
  if (side.powerFault) metrics.powerFault += 1;
  metrics.samples += 1;
}

function newMetrics() {
  return { samples: 0, inRange: 0, arc: 0, ready: 0, align: 0, approach: 0, powerFault: 0 };
}

function simulate(caseInfo, seed, reverse) {
  const nativeA = createSetup(caseInfo.roles[0], kits[caseInfo.kit], 0, caseInfo.mode);
  const nativeB = createSetup(caseInfo.roles[1], kits[caseInfo.kit], 1, caseInfo.mode);
  const firstSetup = reverse ? nativeB : nativeA;
  const secondSetup = reverse ? nativeA : nativeB;
  const arena = createDuelArena('empty', seed);
  const combat = createStrategicCombatService(firstSetup, secondSetup, seed, arena);
  // A/B diagnosis: suppress only the autonomous fight/flee decision.
  // Actual weapon mounts, AI strategy, flight physics and damage are unchanged.
  combat.setTactic('attacker', 'fight');
  combat.setTactic('defender', 'fight');
  const metrics = [newMetrics(), newMetrics()];
  let snapshot = combat.getSnapshot();
  for (let tick = 0; tick < Math.ceil(limit / step) && !snapshot.winner; tick += 1) {
    snapshot = combat.tick(step);
    if (tick % sampleEvery !== 0) continue;
    observe(snapshot.attacker, snapshot.defender, firstSetup, metrics[0]);
    observe(snapshot.defender, snapshot.attacker, secondSetup, metrics[1]);
  }
  const first = reverse ? snapshot.defender : snapshot.attacker;
  const second = reverse ? snapshot.attacker : snapshot.defender;
  const firstStats = reverse ? metrics[1] : metrics[0];
  const secondStats = reverse ? metrics[0] : metrics[1];
  const result = {
    seed, reverse, duration: Number(snapshot.elapsedSeconds.toFixed(1)),
    outcomeReason: snapshot.outcomeReason,
    winner: snapshot.winner === null ? 'timeout' :
      snapshot.winner === (reverse ? 'defender' : 'attacker') ? 'A' : 'B',
    shotsA: first.weaponTelemetry.reduce((sum, gun) => sum + gun.shotsFired, 0),
    shotsB: second.weaponTelemetry.reduce((sum, gun) => sum + gun.shotsFired, 0),
    damageA: Number((first.weaponTelemetry.reduce(
      (sum, gun) => sum + gun.shieldDamageDealt + gun.hullDamageDealt, 0
    )).toFixed(1)),
    damageB: Number((second.weaponTelemetry.reduce(
      (sum, gun) => sum + gun.shieldDamageDealt + gun.hullDamageDealt, 0
    )).toFixed(1)),
    firstStats, secondStats,
  };
  return result;
}

function average(rows, extract) {
  return Number((rows.reduce((sum, row) => sum + extract(row), 0) / rows.length).toFixed(2));
}

function summaryFor(group, rows) {
  return {
    name: group.name,
    roles: group.roles,
    kit: group.kit,
    mode: group.mode,
    n: rows.length,
    winsA: rows.filter((r) => r.winner === 'A').length,
    winsB: rows.filter((r) => r.winner === 'B').length,
    timeouts: rows.filter((r) => r.winner === 'timeout').length,
    escapes: rows.filter((r) => r.outcomeReason === 'escape').length,
    duration: average(rows, (r) => r.duration),
    shotsA: average(rows, (r) => r.shotsA),
    shotsB: average(rows, (r) => r.shotsB),
    damageA: average(rows, (r) => r.damageA),
    damageB: average(rows, (r) => r.damageB),
    arcA: average(rows, (r) => r.firstStats.arc / Math.max(1, r.firstStats.samples)),
    arcB: average(rows, (r) => r.secondStats.arc / Math.max(1, r.secondStats.samples)),
    readyA: average(rows, (r) => r.firstStats.ready / Math.max(1, r.firstStats.samples)),
    readyB: average(rows, (r) => r.secondStats.ready / Math.max(1, r.secondStats.samples)),
    approachA: average(rows, (r) => r.firstStats.approach / Math.max(1, r.firstStats.samples)),
    approachB: average(rows, (r) => r.secondStats.approach / Math.max(1, r.secondStats.samples)),
    powerFaults: rows.reduce(
      (sum, r) => sum + r.firstStats.powerFault + r.secondStats.powerFault, 0
    ),
    rows,
  };
}

function describe(row) {
  return [
    row.name,
    row.winsA + ':' + row.winsB + ':' + row.timeouts,
    'shots=' + row.shotsA + '/' + row.shotsB,
    'arc=' + row.arcA + '/' + row.arcB,
    'ready=' + row.readyA + '/' + row.readyB,
    'fault=' + row.powerFaults,
    'escapes=' + row.escapes,
  ].join(' ');
}

async function main() {
  const groups = [];
  for (const [first, second] of pairs) {
    for (const [kit] of Object.entries(kits)) {
      for (const mode of modes) {
        const group = { roles: [first, second], kit, mode,
          name: first + '_' + second + '_' + kit + '_' + mode };
        const rows = [];
        for (const seed of seeds) {
          rows.push(simulate(group, seed, false), simulate(group, seed, true));
        }
        const summary = summaryFor(group, rows);
        groups.push(summary);
        const message = describe(summary);
        console.log('CONTROLLED_ROLE ' + message);
        assert(await postStatus('success', 'role ' + summary.name, message));
      }
    }
  }
  const total = groups.reduce((sum, row) => sum + row.n, 0);
  assert.equal(total, 288, 'Six matchups x three kits x two mobility modes x eight battles');
  const report = {
    commit: process.env.CIRCLE_SHA1 || null,
    engine: 'real strategic combat service',
    researchOnly: true,
    explicitFightForBothSides: true,
    controlled: ['shared weapons', 'crew', 'accuracy', 'critical', 'weapon damage'],
    normalizedAdditionally: ['hull', 'shields', 'speed', 'turn rate', 'acceleration'],
    preserved: ['real mount geometry', 'weapon arcs', 'role', 'shield geometry'],
    seeds, step, maximumSeconds: limit, total, groups,
  };
  fs.mkdirSync(path.join(root, 'role-audit-output'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'role-audit-output/combat-equal-loadouts.json'),
    JSON.stringify(report, null, 2)
  );
  console.log('CONTROLLED_TOTAL ' + total + ' finished');
  assert(await postStatus('success', 'controlled role total',
    total + ' battles / ' + groups.length + ' groups / matched weapon configurations'));
}

main().catch(async (error) => {
  console.error(error);
  try { await postStatus('failure', 'controlled role audit', String(error).slice(0, 130)); }
  catch { /* Keep the original exception visible in the job log. */ }
  process.exitCode = 1;
});
