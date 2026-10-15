'use strict';

// Run this exact file on both refs and compare the JSON results.
// node scripts/compare-combat-choreography.cjs [output.json]
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../tests/ts-module-loader.cjs');
const root = path.resolve(__dirname, '..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { SHIP_COMPONENT_CATALOG } = loadStandaloneTypeScriptModule(
  root,
  'src/data/ships/ship-component-catalog.ts'
);
const { getShipMine } = loadStandaloneTypeScriptModule(root, 'src/data/combat/ship-mines.ts');
const weapons = SHIP_COMPONENT_CATALOG.weapon;
const railgun = weapons.find((item) => item.id === 'weapon-railgun-1');
const autocannon = weapons.find((item) => item.id === 'weapon-autocannon-1');
if (!railgun || !autocannon) throw new Error('Required reference weapons are missing');

const STEP = 0.08;
const SECONDS = 60;
const SEEDS = [1001, 101, 202, 303]; // 1001 is the existing choreography/exchange gate.
const round = (number) => Number(number.toFixed(3));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const arena = (obstacles = []) => ({
  width: 2400,
  height: 1500,
  attackerPosition: { x: 550, y: 750 },
  defenderPosition: { x: 1850, y: 750 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
  exitPoint: { x: 100, y: 750 },
  obstacles,
});
function ship(id, weapon, facing, speed = 120, tactic = 'fight', mine = false) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 1500,
    hullHp: 1500,
    weapons: [weapon],
    weaponMounts: [{ slotIndex: 0, x: 0, y: 0, facing }],
    mines: mine ? [getShipMine('mine-ion-1')].filter(Boolean) : [],
    hitChance: 0.75,
    dodgeChance: 0.05,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: speed,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
    aiAggression: 90,
    preferredTactic: tactic,
  };
}
const rock = [{ id: 'reference-rock', position: { x: 1200, y: 750 }, radius: 160 }];
const cases = [
  ['front-front', () => [ship('A', railgun, 'forward'), ship('B', railgun, 'forward'), arena()]],
  [
    'front-broadside',
    () => [ship('A', railgun, 'forward'), ship('B', autocannon, 'port'), arena()],
  ],
  [
    'unequal-speed',
    () => [ship('A', railgun, 'forward', 165), ship('B', autocannon, 'port', 85), arena()],
  ],
  ['obstacle', () => [ship('A', railgun, 'forward'), ship('B', autocannon, 'port'), arena(rock)]],
  [
    'minefield',
    () => [
      ship('A', railgun, 'forward', 120, 'minefield', true),
      ship('B', autocannon, 'port'),
      arena(),
    ],
  ],
  [
    'escape',
    () => [ship('A', railgun, 'forward', 150, 'flee'), ship('B', railgun, 'forward'), arena()],
  ],
];
function sampleShip(shipState, previous, dt) {
  const travelled = distance(shipState.position, previous.position);
  return {
    distance: travelled,
    stationarySeconds: shipState.speed < 5 ? dt : 0,
    headingMismatchSeconds:
      shipState.combatIntent &&
      /FRONTAL|ANVISIEREN/.test(shipState.combatIntent) &&
      Math.cos(shipState.headingRadians) * (previous.enemy.x - shipState.position.x) +
        Math.sin(shipState.headingRadians) * (previous.enemy.y - shipState.position.y) <
        0
        ? dt
        : 0,
  };
}
function replay(name, makeScenario, seed) {
  const [attacker, defender, field] = makeScenario();
  const service = createStrategicCombatService(attacker, defender, seed, field);
  // A preferred tactic is an explicit player order, not merely AI configuration.
  if (name === 'escape') service.setTactic('attacker', 'flee');
  if (name === 'minefield') service.setTactic('attacker', 'minefield');
  let current = service.getSnapshot();
  const originalRange = distance(current.attacker.position, current.defender.position);
  const metrics = {
    distance: [0, 0],
    stationarySeconds: [0, 0],
    headingMismatchSeconds: [0, 0],
    peakSpeed: [0, 0],
    speedIntegral: [0, 0],
    intentChanges: [0, 0],
    closePasses: 0,
    sampledFrames: 0,
  };
  const trajectory = [];
  let previousRange = originalRange;
  let minimumRange = originalRange;
  let wasNear = false;
  let last = current;
  const steps = Math.round(SECONDS / STEP);
  for (let frame = 0; frame < steps && !current.winner; frame += 1) {
    current = service.tick(STEP);
    const dt = current.elapsedSeconds - last.elapsedSeconds;
    if (dt <= 0) break;
    for (const [index, side, enemy] of [
      [0, 'attacker', 'defender'],
      [1, 'defender', 'attacker'],
    ]) {
      const s = current[side];
      const earlier = last[side];
      const measure = sampleShip(
        s,
        { position: earlier.position, enemy: current[enemy].position },
        dt
      );
      metrics.distance[index] += measure.distance;
      metrics.stationarySeconds[index] += measure.stationarySeconds;
      metrics.headingMismatchSeconds[index] += measure.headingMismatchSeconds;
      metrics.peakSpeed[index] = Math.max(metrics.peakSpeed[index], s.speed);
      metrics.speedIntegral[index] += s.speed * dt;
      if (s.combatIntent !== earlier.combatIntent) metrics.intentChanges[index] += 1;
    }
    const separation = distance(current.attacker.position, current.defender.position);
    minimumRange = Math.min(minimumRange, separation);
    if (separation < 300 && !wasNear) metrics.closePasses += 1;
    wasNear = separation < 400;
    previousRange = separation;
    metrics.sampledFrames += 1;
    if (frame % 10 === 0 || current.winner) {
      trajectory.push({
        t: round(current.elapsedSeconds),
        a: [
          round(current.attacker.position.x),
          round(current.attacker.position.y),
          round(current.attacker.headingRadians),
        ],
        b: [
          round(current.defender.position.x),
          round(current.defender.position.y),
          round(current.defender.headingRadians),
        ],
      });
    }
    last = current;
  }
  const log = service.getCombatLog();
  const duration = current.elapsedSeconds;
  return {
    case: name,
    seed,
    mode: seed === 1001 ? 'exchange' : 'standard',
    durationSeconds: round(duration),
    winner: current.winner,
    initialSeparation: round(originalRange),
    minimumSeparation: round(minimumRange),
    finalSeparation: round(previousRange),
    escapeDistanceToExit:
      name === 'escape' ? round(distance(current.attacker.position, field.exitPoint)) : null,
    distance: metrics.distance.map(round),
    meanSpeed: metrics.speedIntegral.map((value) => round(value / Math.max(duration, STEP))),
    peakSpeed: metrics.peakSpeed.map(round),
    stationarySeconds: metrics.stationarySeconds.map(round),
    headingMismatchSeconds: metrics.headingMismatchSeconds.map(round),
    intentChanges: metrics.intentChanges,
    closePasses: metrics.closePasses,
    exchangePlans: log.filter((item) => item.event === 'plan').length,
    exchangeResults: log.filter((item) => item.detail.startsWith('EXCHANGE_OUTCOME')).length,
    impacts: log.filter((item) => item.event === 'impact').length,
    mineActions: log.filter((item) => /MINE|MINEFIELD|Minen/i.test(item.detail)).length,
    trajectory,
  };
}
const results = cases.flatMap(([name, makeScenario]) =>
  SEEDS.map((seed) => replay(name, makeScenario, seed))
);
const report = {
  schema: 'sojourn-combat-comparison-v1',
  stepSeconds: STEP,
  maximumSeconds: SECONDS,
  note: 'Run on the exact main and PR heads; only seed 1001 activates the existing exchange controller.',
  results,
};
const payload = JSON.stringify(report, null, 2) + '\n';
if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), payload);
else process.stdout.write(payload);
