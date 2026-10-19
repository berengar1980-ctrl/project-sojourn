'use strict';

// Read-only seeded combat research. Uses the same real duel loadouts as the UI.
// Never modifies weapon values, ship state outside a duel, or main branch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');
const { postStatus } = require('./ci-run-and-report.cjs');

const root = path.resolve(__dirname, '..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createStrategicCombatService } = load(
  'src/systems/combat/strategic-combat-service.ts'
);
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const { DUEL_ENCOUNTERS, resolveDuelPreset } = load('src/ui/start/duel-presets.ts');
const { duelCombatant, duelInstalledComponents } = load(
  'src/ui/start/duel-combatant-setup.ts'
);
const { calculateShipModeEnergy } = load(
  'src/systems/ships/ship-component-service.ts'
);
const { createDuelArena } = load('src/systems/combat/duel-arena-presets.ts');
const { crewDefinitions } = load('src/data/crew/crew-definitions.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');
const { fitsWeaponHardpoint } = load('src/systems/ships/ship-loadout-service.ts');

const ships = getAllShipDefinitions();
const seeds = [1001, 1002, 1013, 1031, 1211, 1543];
const maps = ['empty', 'scattered', 'asteroid_field'];
const limitSeconds = 90;
const stepSeconds = 0.08;
const auditKinds = [
  ...DUEL_ENCOUNTERS.map((preset) => ({ id: preset.id, preset })),
  { id: 'front_repeater', preset: DUEL_ENCOUNTERS[0], replace: 'front_repeater' },
  { id: 'flux_projector', preset: DUEL_ENCOUNTERS[0], replace: 'flux_projector' },
];

function setupFor(preset, sideIndex, replacement) {
  const resolved = resolveDuelPreset(preset, ships)[sideIndex];
  assert(resolved, 'Missing preset combatant');
  const ship = ships.find((entry) => entry.id === resolved.shipId);
  assert(ship, 'Missing duel ship ' + resolved.shipId);
  const weapons = [...resolved.weapons];
  if (replacement && sideIndex === 0) {
    const candidate = SHIP_COMPONENT_CATALOG.weapon.find(
      (entry) => entry.weapon?.family === replacement && entry.tier === 2
    );
    assert(candidate && candidate.weapon, 'Missing research weapon ' + replacement);
    assert(
      fitsWeaponHardpoint(ship, 0, candidate.weapon),
      'Research comparison requires a compatible front mount'
    );
    weapons[0] = candidate.id;
  }
  const crew = crewDefinitions[resolved.crewIndex % crewDefinitions.length];
  const draft = {
    shipId: ship.id,
    weapons,
    mines: [],
    crewId: crew.id,
    reactorId: 'reactor1',
  };
  // Match the production duel-lobby reactor choice, avoiding artificial outages.
  const draw = calculateShipModeEnergy(duelInstalledComponents(draft)).combat;
  const reactor = SHIP_COMPONENT_CATALOG.reactor.find((entry) => entry.output >= draw);
  assert(reactor, 'Research duel exceeds the maximum reactor output');
  draft.reactorId = reactor.id;
  const setup = duelCombatant(sideIndex, draft, ship);
  assert(setup.weapons.length > 0, 'Research duel has no active weapons');
  return setup;
}

function sumTelemetry(snapshot, key) {
  return snapshot.weaponTelemetry.reduce((total, weapon) => total + weapon[key], 0);
}

function simulateSteps(combat, first, second, reverse) {
  let frame = combat.getSnapshot();
  const initialHp = [
    frame.attacker.shieldHp + frame.attacker.hullHp,
    frame.defender.shieldHp + frame.defender.hullHp,
  ];
  let slowSeconds = 0;
  let longestSlow = 0;
  let currentSlow = 0;
  let minimumRange = Infinity;
  for (let tick = 0; tick < Math.ceil(limitSeconds / stepSeconds) && !frame.winner; tick += 1) {
    frame = combat.tick(stepSeconds);
    if (tick % 12 !== 0) continue;
    const attackerSpeed = reverse ? second.combatSpeed : first.combatSpeed;
    const defenderSpeed = reverse ? first.combatSpeed : second.combatSpeed;
    const slow =
      frame.attacker.speed < (attackerSpeed ?? 120) * 0.15 &&
      frame.defender.speed < (defenderSpeed ?? 120) * 0.15;
    currentSlow = slow ? currentSlow + 12 * stepSeconds : 0;
    if (slow) slowSeconds += 12 * stepSeconds;
    longestSlow = Math.max(longestSlow, currentSlow);
    minimumRange = Math.min(
      minimumRange,
      Math.hypot(
        frame.attacker.position.x - frame.defender.position.x,
        frame.attacker.position.y - frame.defender.position.y
      )
    );
  }
  return { frame, initialHp, longestSlow, slowSeconds, minimumRange };
}

function simulate(first, second, seed, arena, reverse) {
  const combat = createStrategicCombatService(
    reverse ? second : first,
    reverse ? first : second,
    seed,
    arena
  );
  const { frame, initialHp, longestSlow, slowSeconds, minimumRange } = simulateSteps(
    combat,
    first,
    second,
    reverse
  );
  const dealtToAttacker =
    initialHp[0] - (frame.attacker.shieldHp + frame.attacker.hullHp);
  const dealtToDefender =
    initialHp[1] - (frame.defender.shieldHp + frame.defender.hullHp);
  const firstWins = frame.winner === (reverse ? 'defender' : 'attacker');
  const secondWins = frame.winner === (reverse ? 'attacker' : 'defender');
  const logs = combat.getCombatLog();
  return {
    seed,
    reverse,
    map: arena.obstacles?.length ? 'rocks' : 'empty',
    duration: Math.round(frame.elapsedSeconds),
    winner: firstWins ? 'first' : secondWins ? 'second' : 'unresolved',
    firstDamage: Number(Math.max(0, reverse ? dealtToAttacker : dealtToDefender).toFixed(1)),
    secondDamage: Number(Math.max(0, reverse ? dealtToDefender : dealtToAttacker).toFixed(1)),
    firstShots: sumTelemetry(reverse ? frame.defender : frame.attacker, 'shotsFired'),
    secondShots: sumTelemetry(reverse ? frame.attacker : frame.defender, 'shotsFired'),
    longestSlow: Number(longestSlow.toFixed(1)),
    slowSeconds: Number(slowSeconds.toFixed(1)),
    minRange: Number(minimumRange.toFixed(1)),
    phaseEvents: logs.filter((entry) => entry.event === 'phase').length,
  };
}

const mean = (rows, key) =>
  rows.reduce((sum, row) => sum + row[key], 0) / Math.max(rows.length, 1);

function summarize(id, rows) {
  const wins = rows.filter((entry) => entry.winner === 'first').length;
  const losses = rows.filter((entry) => entry.winner === 'second').length;
  const unresolved = rows.length - wins - losses;
  return {
    id,
    n: rows.length,
    wins,
    losses,
    unresolved,
    duration: Number(mean(rows, 'duration').toFixed(1)),
    damageFirst: Number(mean(rows, 'firstDamage').toFixed(1)),
    damageSecond: Number(mean(rows, 'secondDamage').toFixed(1)),
    shotsFirst: Number(mean(rows, 'firstShots').toFixed(1)),
    shotsSecond: Number(mean(rows, 'secondShots').toFixed(1)),
    slowMax: Math.max(...rows.map((row) => row.longestSlow)),
    silent: rows.filter((row) => row.firstShots + row.secondShots === 0).length,
    details: rows,
  };
}

function compactSummary(value) {
  return (
    value.id +
    ' n=' +
    value.n +
    ' W/L/U ' +
    value.wins +
    '/' +
    value.losses +
    '/' +
    value.unresolved +
    ' dmg ' +
    value.damageFirst +
    '/' +
    value.damageSecond +
    ' shots ' +
    value.shotsFirst +
    '/' +
    value.shotsSecond +
    ' slowMax ' +
    value.slowMax +
    's'
  );
}

async function main() {
  const groups = [];
  for (const kind of auditKinds) {
    const first = setupFor(kind.preset, 0, kind.replace);
    const second = setupFor(kind.preset, 1);
    const runs = [];
    for (const [index, seed] of seeds.entries()) {
      for (const reverse of [false, true]) {
        // An arena's drifting asteroids are mutated during battle.
        // Recreate it for each side order, otherwise swaps are not comparable.
        const arena = createDuelArena(maps[index % maps.length], seed);
        runs.push(simulate(first, second, seed, arena, reverse));
      }
    }
    const group = summarize(kind.id, runs);
    groups.push(group);
    const message = compactSummary(group);
    console.log('BALANCE_GROUP ' + message);
    assert(await postStatus('success', 'balance ' + group.id, message));
  }
  const all = groups.flatMap((group) => group.details);
  assert.equal(all.length, 132, 'Expect 11 matchups with six seeds and both sides');
  const grand = summarize('all', all);
  const report = {
    evaluatedAt: new Date().toISOString(),
    commit: process.env.CIRCLE_SHA1 ?? null,
    readOnly: true,
    engine: 'canonical duel service',
    secondsPerFight: limitSeconds,
    seeds,
    maps,
    groups,
    grand,
  };
  fs.mkdirSync(path.join(root, 'balance-audit-output'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'balance-audit-output/combat-balance-132.json'),
    JSON.stringify(report, null, 2)
  );
  const message = compactSummary(grand);
  console.log('BALANCE_TOTAL ' + message);
  console.log('BALANCE_OUTLIERS:');
  for (const group of groups.filter((entry) => entry.unresolved >= 8 || entry.silent > 0)) {
    console.log('BALANCE_RISK ' + compactSummary(group));
  }
  assert(await postStatus('success', 'balance total', message));
}

main().catch(async (error) => {
  console.error(error);
  try {
    await postStatus('failure', 'balance audit', String(error).slice(0, 135));
  } catch {
    // Preserve the original diagnostic.
  }
  process.exitCode = 1;
});
