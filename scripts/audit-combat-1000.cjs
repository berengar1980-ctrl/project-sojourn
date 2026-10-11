'use strict';

// Execute in the repository: npm run combat:audit -- 1000 > combat-audit.json
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

const weapons = SHIP_COMPONENT_CATALOG.weapon ?? [];
function weapon(family) {
  const found = weapons.find((item) => item.tier === 1 && item.weapon?.family === family);
  if (!found) throw new Error('Missing Mk I weapon family: ' + family);
  return found;
}
const families = [
  'pulse_laser',
  'ion_laser',
  'railgun',
  'autocannon',
  'plasma_battery',
  'ion_cannon',
  'guided_missile',
  'he_missile',
];
const scenarios = [
  { id: 'front', a: ['railgun', 'pulse_laser'], b: ['railgun', 'pulse_laser'] },
  { id: 'range', a: ['railgun'], b: ['autocannon'], speed: [145, 100] },
  { id: 'shields', a: ['ion_laser', 'ion_cannon'], b: ['autocannon', 'railgun'] },
  { id: 'broadside', a: ['plasma_battery', 'autocannon'], b: ['ion_cannon', 'plasma_battery'] },
  { id: 'missiles', a: ['guided_missile', 'he_missile'], b: ['pulse_laser', 'ion_laser'] },
  { id: 'mixed', a: ['railgun', 'ion_laser'], b: ['plasma_battery', 'guided_missile'] },
  { id: 'minefield', a: ['ion_laser', 'autocannon'], b: ['railgun'], mines: true },
  { id: 'boarding', a: ['pulse_laser'], b: ['pulse_laser'], boarding: true },
  { id: 'flight', a: ['ion_cannon', 'he_missile'], b: ['railgun'], flee: true },
  { id: 'random', a: null, b: null },
];
const mineIds = ['mine-ion-1', 'mine-shaped-charge-1', 'mine-hunter-1'];
const mines = mineIds.map(getShipMine).filter(Boolean);

function loadout(familiesForShip, seed, side) {
  const chosen = familiesForShip ?? [
    families[(seed + side) % families.length],
    families[(Math.floor(seed / 7) + side * 3) % families.length],
  ];
  return chosen.map(weapon);
}
function ship(name, components, speed, tactics, withMines) {
  return {
    id: name,
    name,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 160,
    hullHp: 240,
    weapons: components,
    weaponMounts: components.map((component, index) => ({
      slotIndex: index,
      x: index * 4,
      y: index % 2 ? -8 : 8,
      facing: component.weapon?.mount === 'broadside' ? 'port' : 'forward',
    })),
    hitChance: 0.74,
    dodgeChance: 0.06,
    damageMultiplier: 1,
    criticalChance: 0.08,
    cycleTimeMultiplier: 1,
    combatSpeed: speed,
    accelerationMetersPerSecond2: 36,
    turnRateRadiansPerSecond: 0.84,
    aiControlled: true,
    aiAggression: 95,
    preferredTactic: tactics,
    mines: withMines ? mines : [],
  };
}
function run(seed, scenario) {
  const first = ship(
    'A',
    loadout(scenario.a, seed, 0),
    scenario.speed?.[0] ?? 115,
    scenario.mines ? 'minefield' : scenario.flee ? 'flee' : 'fight',
    Boolean(scenario.mines)
  );
  const second = ship(
    'B',
    loadout(scenario.b, seed, 1),
    scenario.speed?.[1] ?? 115,
    'fight',
    false
  );
  const distance = scenario.boarding ? 400 : 850;
  const combat = createStrategicCombatService(first, second, seed, {
    width: 2800,
    height: 1800,
    attackerPosition: { x: 1000, y: 900 },
    defenderPosition: { x: 1000 + distance, y: 900 },
  });
  let snap = combat.getSnapshot();
  let projectiles = 0,
    mineSeen = false,
    minDropped = 0,
    grappleAttempt = false;
  let sumMovement = 0,
    lastPos = { ...snap.attacker.position };
  let staleSeconds = 0,
    longestStale = 0,
    lastDamageAt = 0;
  let lastHp =
    snap.attacker.hullHp + snap.attacker.shieldHp + snap.defender.hullHp + snap.defender.shieldHp;
  const doctrineSeen = new Set();
  const maxSteps = 2000;
  for (let i = 0; i < maxSteps && !snap.winner; i += 1) {
    if (scenario.boarding && i % 30 === 0 && !grappleAttempt) {
      grappleAttempt = combat.fireGrapple('attacker') || grappleAttempt;
    }
    snap = combat.tick(0.08);
    if (snap.projectiles.length) projectiles += 1;
    if (snap.mines.length) {
      mineSeen = true;
      minDropped = Math.max(minDropped, snap.mines.length);
    }
    sumMovement += Math.hypot(
      snap.attacker.position.x - lastPos.x,
      snap.attacker.position.y - lastPos.y
    );
    lastPos = { ...snap.attacker.position };
    const hp =
      snap.attacker.hullHp + snap.attacker.shieldHp + snap.defender.hullHp + snap.defender.shieldHp;
    if (hp < lastHp) lastDamageAt = snap.elapsedSeconds;
    lastHp = hp;
    staleSeconds = snap.elapsedSeconds - lastDamageAt;
    longestStale = Math.max(longestStale, staleSeconds);
    for (const s of [snap.attacker, snap.defender]) {
      if (s.strategy?.doctrine) doctrineSeen.add(s.strategy.doctrine);
    }
  }
  const log = combat.getCombatLog();
  const planEntries = log.filter((e) => e.event === 'plan');
  const phaseEntries = log.filter((e) => e.event === 'phase' && e.side !== 'system');
  return {
    scenario: scenario.id,
    seed,
    duration: Number(snap.elapsedSeconds.toFixed(2)),
    winner: snap.winner,
    unresolved: !snap.winner,
    firstPlanner: log.find((e) => e.side === 'system' && e.event === 'start')?.detail ?? '',
    totalImpactEvents: log.filter((e) => e.event === 'impact').length,
    totalPlanReviews: planEntries.length,
    phaseChanges: phaseEntries.length,
    doctrines: [...doctrineSeen].sort(),
    totalTravelMeters: Math.round(sumMovement),
    longestNoDamageSeconds: Number(longestStale.toFixed(2)),
    projectileFrames: projectiles,
    mineSeen,
    maxSimultaneousMines: minDropped,
    grappleAttempt,
    boardingSuccess: Boolean(snap.boardingInitiator),
    attackerShield: Math.round(snap.attacker.shieldHp),
    defenderShield: Math.round(snap.defender.shieldHp),
  };
}
function summarize(results, scenario) {
  const subset = results.filter((result) => result.scenario === scenario.id);
  const avg = (field) =>
    Number((subset.reduce((sum, r) => sum + r[field], 0) / subset.length).toFixed(2));
  return {
    scenario: scenario.id,
    fights: subset.length,
    winsA: subset.filter((r) => r.winner === 'attacker').length,
    winsB: subset.filter((r) => r.winner === 'defender').length,
    unresolved: subset.filter((r) => r.unresolved).length,
    avgDuration: avg('duration'),
    avgImpacts: avg('totalImpactEvents'),
    avgPlanReviews: avg('totalPlanReviews'),
    avgPhaseChanges: avg('phaseChanges'),
    avgTravelMeters: avg('totalTravelMeters'),
    avgLongestNoDamage: avg('longestNoDamageSeconds'),
    mineDeployRate: avg('mineSeen'),
    grappleAttemptRate: avg('grappleAttempt'),
    boardingSuccessRate: avg('boardingSuccess'),
    doctrines: [...new Set(subset.flatMap((r) => r.doctrines))].sort(),
  };
}
const count = Math.max(10, Math.min(5000, Number(process.argv[2] ?? 1000) || 1000));
const results = Array.from({ length: count }, (_, i) => {
  const scenario = scenarios[i % scenarios.length];
  return run(10001 + i, scenario);
});
process.stdout.write(
  JSON.stringify(
    {
      format: 'harrowdrift-combat-audit-v1',
      totalFights: count,
      durationCapSeconds: 160,
      gearTier: 1,
      caveat: 'Simulation diagnostics, not an animation or human-fun measurement',
      summaries: scenarios.map((s) => summarize(results, s)),
      results,
    },
    null,
    2
  ) + '\n'
);
