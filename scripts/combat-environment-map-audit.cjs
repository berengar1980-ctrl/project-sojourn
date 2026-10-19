'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');
const { postStatus } = require('./ci-run-and-report.cjs');

const root = path.resolve(__dirname, '..');
const load = (source) => loadStandaloneTypeScriptModule(root, source);
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
const { createDuelArena, DUEL_MAPS } = load('src/systems/combat/duel-arena-presets.ts');
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const { DUEL_ENCOUNTERS, resolveDuelPreset } = load('src/ui/start/duel-presets.ts');
const { duelCombatant, duelInstalledComponents } = load('src/ui/start/duel-combatant-setup.ts');
const { calculateShipModeEnergy } = load('src/systems/ships/ship-component-service.ts');
const { SHIP_COMPONENT_CATALOG } = load('src/data/ships/ship-component-catalog.ts');
const { SHIP_MINE_CATALOG } = load('src/data/combat/ship-mines.ts');
const { crewDefinitions } = load('src/data/crew/crew-definitions.ts');
const { resolveCombatAsteroidContacts } = load('src/systems/combat/combat-asteroid-contacts.ts');
const { maybeLaunchTractorAsteroid, advanceThrownAsteroids } = load(
  'src/systems/combat/combat-tractor-asteroid-throw.ts'
);
const { advanceRuntimeMines } = load('src/systems/combat/strategic-combat-mines.ts');

const ships = getAllShipDefinitions();
const seeds = [1701, 1801, 1901, 2001];
const profiles = ['weapons', 'collisions', 'tractor', 'mines', 'combined'];
const step = 0.08;
const seconds = 90;

function construct(presetId, index, profile) {
  const preset = DUEL_ENCOUNTERS.find((row) => row.id === presetId);
  assert(preset, 'Missing comparison preset ' + presetId);
  const resolved = resolveDuelPreset(preset, ships)[index];
  const ship = ships.find((entry) => entry.id === resolved.shipId);
  assert(ship, 'Missing ship for actual duel loadout');
  const noGuns = ['collisions', 'tractor', 'mines'].includes(profile);
  const weapons = noGuns ? [] : resolved.weapons;
  const mines = (profile === 'mines' || profile === 'combined') && index === 0
    ? ['mine-ion-2', 'mine-hunter-2', 'mine-shaped-charge-2'] : [];
  const draft = {
    shipId: ship.id, weapons, mines, crewId: crewDefinitions[0].id,
    reactorId: 'reactor1',
  };
  const draw = calculateShipModeEnergy(duelInstalledComponents(draft)).combat;
  const reactor = SHIP_COMPONENT_CATALOG.reactor.find((part) => part.output >= draw);
  assert(reactor, 'Comparison equipment cannot be powered');
  draft.reactorId = reactor.id;
  const setup = duelCombatant(index, draft, ship);
  if (profile === 'collisions') {
    return { ...setup, shieldHp: 250, hullHp: 400, tractorRangeMeters: 0 };
  }
  if (profile === 'tractor') {
    return { ...setup, shieldHp: index === 0 ? 0 : 280, hullHp: 400 };
  }
  if (profile === 'mines') {
    return { ...setup, shieldHp: 260, hullHp: 400 };
  }
  return setup;
}

function setupPair(profile, reverse) {
  const preset = ['weapons', 'collisions', 'mines'].includes(profile) ? 'alpha' : 'zeta';
  const a = construct(preset, 0, profile);
  const b = construct(preset, 1, profile);
  return reverse ? [b, a] : [a, b];
}

function mapProperties(arena) {
  const asteroids = arena.asteroids ?? [];
  return {
    bodies: asteroids.length,
    blockers: (arena.obstacles ?? []).length,
    throwable: asteroids.filter((a) => a.radius >= 5 && a.radius <= 35).length,
    wreckFragments: asteroids.filter((a) =>
      a.debrisVariant || a.sectionVariant || a.containerVariant
    ).length,
  };
}

function parseEvents(log) {
  const contains = (name) => log.filter((event) => event.detail.includes(name));
  const throws = contains('TRACTOR_ASTEROID_THROW').length;
  const scrapThrows = contains('TRACTOR_SCRAP_THROW').length;
  const asteroidHits = contains('TRACTOR_ASTEROID_HIT');
  const scrapHits = contains('TRACTOR_SCRAP_HIT');
  const mineHits = contains('MINE_DETONATE');
  const mineDeploys = contains('MINE_DEPLOY').length;
  const thrownDamage = [...asteroidHits, ...scrapHits].reduce((sum, event) => {
    const shield = Number(event.detail.match(/shield=([\d.]+)/)?.[1] ?? 0);
    const hull = Number(event.detail.match(/hull=([\d.]+)/)?.[1] ?? 0);
    return sum + shield + hull;
  }, 0);
  return {
    tractorRockThrows: throws, tractorWreckThrows: scrapThrows,
    tractorRockHits: asteroidHits.length, tractorWreckHits: scrapHits.length,
    tractorDamage: Number(thrownDamage.toFixed(2)),
    mineDeploys, mineDetonations: mineHits.length,
    mineDamageLogged: Number(mineHits.reduce((sum, event) =>
      sum + Number(event.detail.match(/(shield|hull)\s+([\d.]+)/)?.[2] ?? 0), 0).toFixed(2)),
    tractorPulses: contains('TRAKTORIMPULS').length,
    ramImpacts: log.filter((event) => event.detail.includes('RAM') &&
      event.event !== 'state').length,
  };
}

function runFight(profile, map, seed, reverse) {
  const setups = setupPair(profile, reverse);
  const arena = createDuelArena(map, seed);
  const { attacker: firstSetup, defender: secondSetup } = {
    attacker: setups[0], defender: setups[1],
  };
  const fight = createStrategicCombatService(firstSetup, secondSetup, seed, arena);
  // The environment, not civilian risk doctrine, is the independent variable.
  fight.setTactic('attacker', profile === 'mines' && !reverse ? 'minefield' : 'fight');
  fight.setTactic('defender', profile === 'mines' && reverse ? 'minefield' : 'fight');
  let frame = fight.getSnapshot();
  const initial = [frame.attacker, frame.defender].map((ship) => ship.shieldHp + ship.hullHp);
  const trajectory = { shortestRange: Infinity, peakThrown: 0, peakDeployedMines: 0 };
  for (let i = 0; i < seconds / step && !frame.winner; i += 1) {
    frame = fight.tick(step);
    if (i % 10 !== 0) continue;
    const distance = Math.hypot(
      frame.attacker.position.x - frame.defender.position.x,
      frame.attacker.position.y - frame.defender.position.y
    );
    trajectory.shortestRange = Math.min(trajectory.shortestRange, distance);
    trajectory.peakThrown = Math.max(trajectory.peakThrown, frame.thrownAsteroids.length);
    trajectory.peakDeployedMines = Math.max(trajectory.peakDeployedMines, frame.mines.length);
  }
  const shots = (ship) => ship.weaponTelemetry.reduce((sum, gun) => sum + gun.shotsFired, 0);
  const gunDamage = (ship) => ship.weaponTelemetry.reduce((sum, gun) =>
    sum + gun.shieldDamageDealt + gun.hullDamageDealt, 0);
  const result = {
    profile, map, seed, reverse, duration: Number(frame.elapsedSeconds.toFixed(1)),
    winner: frame.winner, outcome: frame.outcomeReason,
    lossA: Number((initial[0] - frame.attacker.shieldHp - frame.attacker.hullHp).toFixed(2)),
    lossB: Number((initial[1] - frame.defender.shieldHp - frame.defender.hullHp).toFixed(2)),
    shots: shots(frame.attacker) + shots(frame.defender),
    gunDamage: Number((gunDamage(frame.attacker) + gunDamage(frame.defender)).toFixed(2)),
    ...parseEvents(fight.getCombatLog()), ...trajectory,
  };
  assert(Number.isFinite(result.lossA) && Number.isFinite(result.lossB));
  return result;
}

function directCollision(arena, kind) {
  const source = (arena.asteroids ?? []).find((rock) =>
    kind === 'wreck'
      ? Boolean(rock.debrisVariant || rock.sectionVariant || rock.containerVariant)
      : !rock.debrisVariant && !rock.sectionVariant && !rock.containerVariant
  );
  if (!source) return null;
  const rock = {
    ...source, position: { ...source.position }, velocity: { ...source.velocity },
  };
  const ship = {
    setup: { shieldGeometry: {
      centerOffset: { x: 0, y: 0 }, radiusX: 50, radiusY: 20, modifier: 1,
    } },
    position: { x: rock.position.x - (rock.collisionRadius ?? rock.radius) - 45,
      y: rock.position.y },
    velocity: { x: 80, y: 0 }, speed: 80, headingRadians: 0,
    shieldHp: 150, shieldMaxHp: 150, hullHp: 300, shieldImpacts: [],
  };
  resolveCombatAsteroidContacts(ship, { asteroids: [rock], obstacles: [] });
  return {
    originalKind: source.kind,
    sourceId: source.id,
    shieldLoss: Number((150 - ship.shieldHp).toFixed(2)),
    hullLoss: Number((300 - ship.hullHp).toFixed(2)),
    impactEffects: ship.shieldImpacts.length,
  };
}

function directThrow(arena) {
  const source = (arena.asteroids ?? []).find((rock) => rock.radius >= 5 && rock.radius <= 35);
  if (!source) return null;
  const rock = {
    ...source, position: { ...source.position }, velocity: { x: 0, y: 0 },
  };
  const tractor = {
    position: { x: rock.position.x - 80, y: rock.position.y },
    velocity: { x: 0, y: 0 },
    shieldHp: 0, hullHp: 300,
    tactic: 'fight', subsystems: { tractor: 100 },
    setup: { name: 'research miner', tractorRangeMeters: 500,
      tractorCanManipulateObjects: true, shieldGeometry: { radiusX: 28, radiusY: 20 } },
  };
  const target = {
    position: { x: rock.position.x + 330, y: rock.position.y },
    velocity: { x: 0, y: 0 },
    shieldHp: 150, hullHp: 300,
    setup: { name: 'research target', shieldGeometry: { radiusX: 28, radiusY: 20 } },
  };
  const rt = {
    attacker: tractor, defender: target,
    arena: { asteroids: [rock], obstacles: [] }, mines: [],
    thrownAsteroids: [], elapsedSeconds: 0, impactSerial: 0, combatLog: [],
  };
  maybeLaunchTractorAsteroid(rt, 'attacker', tractor, target);
  const launched = rt.thrownAsteroids.length;
  for (let i = 0; i < 85 && rt.thrownAsteroids.length; i += 1)
    advanceThrownAsteroids(rt, 0.08);
  return {
    sourceId: source.id,
    kind: source.debrisVariant || source.sectionVariant || source.containerVariant
      ? 'wreck' : 'asteroid',
    launched, hits: rt.combatLog.filter((e) => /TRACTOR_(SCRAP|ASTEROID)_HIT/.test(e.detail)).length,
    shieldLoss: Number((150 - target.shieldHp).toFixed(2)),
    hullLoss: Number((300 - target.hullHp).toFixed(2)),
  };
}

function directMine(kind, layer) {
  const def = SHIP_MINE_CATALOG.find((entry) => entry.kind === kind && entry.tier === 2);
  assert(def, 'Missing canonical mine Mk II');
  const source = { position: { x: 0, y: 0 }, setup: { name: 'mine ship', damageMultiplier: 1 } };
  const target = {
    position: { x: 400, y: 400 }, headingRadians: 0,
    shieldHp: layer === 'shield' ? 200 : 0, shieldMaxHp: 200,
    hullHp: 300, shieldImpacts: [], subsystems: { engine: 300, tractor: 0 },
    setup: { name: 'target', damageMultiplier: 1 },
  };
  const runtime = {
    attacker: source, defender: target, elapsedSeconds: 1, impactSerial: 0, combatLog: [],
    mines: [{ id: 1, owner: 'attacker', armedSeconds: 0, pursuitRemaining: 0,
      position: { ...target.position }, definition: def }],
  };
  advanceRuntimeMines(runtime, 0.08);
  return { kind, layer, triggered: runtime.mines.length === 0,
    shieldLoss: Number(((layer === 'shield' ? 200 : 0) - target.shieldHp).toFixed(2)),
    hullLoss: Number((300 - target.hullHp).toFixed(2)) };
}

function mean(rows, key) {
  return Number((rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(2));
}

function summary(map, profile, rows) {
  return {
    map, profile, runs: rows.length,
    avgLoss: mean(rows, 'lossA') + mean(rows, 'lossB'),
    avgGunDamage: mean(rows, 'gunDamage'),
    avgShots: mean(rows, 'shots'),
    avgTractorDamage: mean(rows, 'tractorDamage'),
    rockThrows: rows.reduce((s, row) => s + row.tractorRockThrows, 0),
    wreckThrows: rows.reduce((s, row) => s + row.tractorWreckThrows, 0),
    rockHits: rows.reduce((s, row) => s + row.tractorRockHits, 0),
    wreckHits: rows.reduce((s, row) => s + row.tractorWreckHits, 0),
    mineDeploys: rows.reduce((s, row) => s + row.mineDeploys, 0),
    mineDetonations: rows.reduce((s, row) => s + row.mineDetonations, 0),
    mineDamage: Number(rows.reduce((s, row) => s + row.mineDamageLogged, 0).toFixed(2)),
    timeouts: rows.filter((row) => row.winner === null).length,
    rows,
  };
}

function compact(result) {
  return [
    result.map, result.profile,
    'n=' + result.runs, 'loss=' + result.avgLoss,
    'gun=' + result.avgGunDamage, 'shots=' + result.avgShots,
    'tractor=' + result.rockHits + '/' + result.wreckHits,
    'mine=' + result.mineDetonations, 'mineDamage=' + result.mineDamage,
  ].join(' ');
}

async function safeFixtureStatus(title, description) {
  try {
    await postStatus('success', title, description);
  } catch (error) {
    console.warn('STATUS_WARN ' + title + ' ' + String(error));
  }
}

async function runFixtureAudit() {
    const results = [];
    for (const map of DUEL_MAPS.map((item) => item.id)) {
      const sample = createDuelArena(map, seeds[0]);
      const observed = {
        map,
        ...mapProperties(sample),
        collisionAsteroid: directCollision(sample, 'asteroid'),
        collisionWreck: directCollision(sample, 'wreck'),
        throw: directThrow(createDuelArena(map, seeds[0])),
      };
      results.push(observed);
      const damage = (hit) => hit ? hit.shieldLoss + hit.hullLoss : 'n/a';
      const description = [
        map, 'rock=' + damage(observed.collisionAsteroid),
        'wreck=' + damage(observed.collisionWreck),
        'throw=' + damage(observed.throw),
        'throwHits=' + (observed.throw?.hits ?? 0),
      ].join(' ');
      console.log('DIRECT_MAP ' + JSON.stringify(observed));
      await safeFixtureStatus('direct impact ' + map, description);
    }
    const mines = ['ion', 'shaped_charge', 'hunter'].flatMap((kind) => [
      directMine(kind, 'shield'),
      directMine(kind, 'hull'),
    ]);
    for (const entry of mines) {
      console.log('DIRECT_MINE ' + JSON.stringify(entry));
      await safeFixtureStatus('direct mine ' + entry.kind + ' ' + entry.layer,
        entry.kind + ' ' + entry.layer + ' shield=' + entry.shieldLoss +
        ' hull=' + entry.hullLoss);
    }
    const missing = [
      ['asteroid_field', 'collisions'],
      ['asteroid_field', 'tractor'],
      ['scrap_field', 'tractor'],
      ['scrap_field', 'mines'],
    ];
    for (const [map, profile] of missing) {
      const rows = seeds.flatMap((seed) => [
        runFight(profile, map, seed, false),
        runFight(profile, map, seed, true),
      ]);
      const result = summary(map, profile, rows);
      console.log('RECHECK_MAP ' + compact(result));
      await safeFixtureStatus('recheck ' + map + ' ' + profile, compact(result));
    }
    const dir = path.join(root, 'environment-map-audit-output');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'environment-direct-fixtures.json'),
      JSON.stringify({ maps: results, mines }, null, 2));
}

async function main() {
  if (process.argv.includes('--fixtures-only')) return runFixtureAudit();
  const groups = [];
  const fixtures = [];
  const mapData = [];
  for (const map of DUEL_MAPS.map((m) => m.id)) {
    const sample = createDuelArena(map, seeds[0]);
    mapData.push({ map, ...mapProperties(sample) });
    fixtures.push({
      map, collisionAsteroid: directCollision(sample, 'asteroid'),
      collisionWreck: directCollision(sample, 'wreck'),
      throw: directThrow(createDuelArena(map, seeds[0])),
    });
    for (const profile of profiles) {
      const rows = seeds.flatMap((seed) => [
        runFight(profile, map, seed, false),
        runFight(profile, map, seed, true),
      ]);
      const result = summary(map, profile, rows);
      groups.push(result);
      const message = compact(result);
      console.log('ENVIRONMENT_GROUP ' + message);
      try {
        await postStatus('success', 'environment ' + map + ' ' + profile, message);
      } catch (error) {
        // A transient external status API outage must not abort real physics measurements.
        console.warn('STATUS_WARN ' + String(error));
      }
    }
  }
  const mineFixtures = ['ion', 'shaped_charge', 'hunter'].flatMap((kind) => [
    directMine(kind, 'shield'), directMine(kind, 'hull'),
  ]);
  assert.equal(groups.length, 25);
  assert.equal(groups.reduce((sum, g) => sum + g.runs, 0), 200);
  for (const result of mineFixtures) assert(result.triggered, 'canonical mine failed to trigger');
  const report = {
    date: new Date().toISOString(), commit: process.env.CIRCLE_SHA1,
    maps: mapData, seeds, fixedFightOrders: true,
    mapMatches: groups, stagedActualMapFixtures: fixtures,
    tierTwoMineFixtures: mineFixtures,
    notes: [
      'Map fights use the actual duel arena generator and unchanged combat engine.',
      'Staged fixtures use real map rocks but intentionally force one direct collision or throw.',
      'Tractor pulse only changes velocity and cannot be reported as direct HP damage.',
      'HP loss outside isolated fixtures includes multiple causes and must not be assigned to rocks alone.',
    ],
  };
  const dir = path.join(root, 'environment-map-audit-output');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'environment-map-damage.json'),
    JSON.stringify(report, null, 2));
  for (const record of fixtures) console.log('ENVIRONMENT_FIXTURE ' + JSON.stringify(record));
  for (const mine of mineFixtures) console.log('ENVIRONMENT_MINE ' + JSON.stringify(mine));
  const message = '200 map fights, 5 maps, 25 groups; actual contact/throw and mine fixtures';
  console.log('ENVIRONMENT_TOTAL ' + message);
  try {
    await postStatus('success', 'environment total', message);
  } catch (error) {
    console.warn('STATUS_WARN ' + String(error));
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await postStatus('failure', 'environment audit', String(error).slice(0, 135)); }
  catch { /* Keep the underlying stack. */ }
  process.exitCode = 1;
});
