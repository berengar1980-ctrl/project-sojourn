'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { calculateShipModeEnergy } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-component-service.ts'
);
const { duelInstalledComponents, duelCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/start/duel-combatant-setup.ts'
);
const { getAllShipDefinitions } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/ships/ship-registry.ts'
);
const { advanceCombatPower } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-power-service.ts'
);
const { pulseCombatTractor } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-pulse.ts'
);
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { usefulRamAttempt } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-ram-opportunity.ts'
);
const { missedShotEnd, missedShotAbove } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-miss-depth.ts'
);

const draft = {
  shipId: '',
  weapons: [],
  mines: [],
  crewId: '',
  reactorId: 'reactor1',
  engineId: 'engine6',
  shieldId: 'shield6',
  hullId: 'hull6',
  armorId: 'armor-front-6',
  sensorId: 'sensor6',
  tractorId: 'tractor6',
  miningId: 'mining6',
  salvageId: 'salvage6',
  cargoId: 'cargo6',
};
const installed = duelInstalledComponents(draft);
const power = calculateShipModeEnergy(installed);
assert.equal(power.output, 40);
assert(power.combat > power.output, 'over-equipping is accepted, not blocked by UI');
assert(power.industrial > power.output, 'industrial mode has its own demand');
assert(power.mining < power.total, 'mining shuts off salvage and combat guns');
assert(power.salvage < power.total, 'salvage shuts off mining and shields');
assert.equal(power.industrial, Math.max(power.mining, power.salvage));
const industrialShed = power.total - power.combat;
assert.equal(industrialShed, 35 + 33, 'combat sheds mining and salvage loads');
assert.equal(
  power.shedInCombat,
  industrialShed,
  'UI reports the complete shut-down industrial load'
);
const ships = getAllShipDefinitions();
const ship = ships.find((entry) => entry.role === 'salvage');
assert(ship);
const setup = duelCombatant(0, draft, ship);
assert(setup.hullHp > 82, 'reinforced hull module increases actual combat hull HP');
assert(setup.shieldHp > 81, 'selected shield increases actual combat shield HP');
assert.equal(setup.armor.front, 0.5, 'Mk VI forward armor reaches ram AI');
assert.equal(setup.power.combat, power.combat, 'combat setup uses canonical power budget');

const faulted = { setup: { power }, powerStress: 0, powerFaultRemaining: 0, boostActive: true };
assert.equal(advanceCombatPower(faulted, 0.08), false);
let tripped = false;
for (let n = 0; n < 60 && !tripped; n++) {
  tripped = advanceCombatPower(faulted, 0.08);
}
assert(tripped, 'sustained power excess causes a deterministic temporary brownout');
assert.equal(faulted.powerFault, 'total', 'severe overload disables propulsion and guns');
assert.equal(faulted.boostActive, false);
const stable = {
  setup: { power: { ...power, combat: 25 } },
  powerFault: 'total',
  powerFaultRemaining: 1,
};
advanceCombatPower(stable, 0.08);
assert.equal(stable.powerFault, undefined, 'normal supply clears the failure state');

// Full power loss must also shut down active tractor pulses. Weapons-only
// brownouts still leave the tractor and flight controls operational.
const pulseSource = {
  setup: { tractorRangeMeters: 600, name: 'Test tractor' },
  shieldHp: 0,
  subsystems: { tractor: 80 },
  powerFault: 'total',
  tactic: 'fight',
  position: { x: 100, y: 100 },
  velocity: { x: 0, y: 0 },
  tractorPulseCooldown: 0,
};
const pulseEnemy = {
  hullHp: 80,
  position: { x: 400, y: 100 },
  velocity: { x: 80, y: 0 },
  speed: 80,
};
const pulseRuntime = { elapsedSeconds: 10, beams: [], beamSerial: 0, combatLog: [] };
pulseCombatTractor(pulseRuntime, 'attacker', pulseSource, pulseEnemy, 0.08);
assert.equal(pulseRuntime.beams.length, 0, 'total power loss prevents tractor impulse');
assert.equal(pulseEnemy.velocity.x, 80, 'disabled tractor leaves the target untouched');
pulseSource.powerFault = 'weapons';
pulseCombatTractor(pulseRuntime, 'attacker', pulseSource, pulseEnemy, 0.08);
assert.equal(pulseRuntime.beams.length, 1, 'tractor remains available in weapons-only fault');
assert(pulseEnemy.velocity.x < 80, 'operational tractor brakes a departing opponent');

// End-to-end: the real duel tick must apply temporary overloads and preserve
// inertia and heading while both propulsion and RCS are powerless.
const duelling = createStrategicCombatService(
  setup,
  { ...setup, id: 'stable-test-ship', power: { ...power, combat: power.output } },
  901,
  { width: 4200, height: 2600, obstacles: [], asteroids: [] }
);
let blackout = null;
for (let i = 0; i < 80; i += 1) {
  const snapshot = duelling.tick(0.08);
  if (snapshot.attacker.powerFault === 'total') {
    blackout = snapshot;
    break;
  }
}
assert(blackout, 'combat runtime develops a total brownout from excessive MW draw');
assert.equal(blackout.defender.powerFault, undefined, 'adequate reactor supply remains stable');
const drifting = duelling.tick(0.08);
assert.equal(drifting.attacker.powerFault, 'total');
assert.equal(drifting.attacker.headingRadians, blackout.attacker.headingRadians);
const expectedDriftX = blackout.attacker.position.x + blackout.attacker.velocity.x * 0.08;
const expectedDriftY = blackout.attacker.position.y + blackout.attacker.velocity.y * 0.08;
assert(
  Math.abs(drifting.attacker.position.x - expectedDriftX) < 0.001,
  'powerless ships drift without gaining horizontal thrust'
);
assert(
  Math.abs(drifting.attacker.position.y - expectedDriftY) < 0.001,
  'powerless ships drift without gaining vertical thrust'
);
assert(
  duelling.getCombatLog().some((entry) => entry.detail.includes('ENERGIEÜBERLAST')),
  'the real combat HUD/log receives the brownout event'
);

const first = {
  setup: { armor: { front: 0.5, port: 0, starboard: 0 } },
  tactic: 'fight',
  position: { x: 500, y: 500 },
  hullHp: 82,
  hullMaxHp: 82,
  shieldHp: 0,
  shieldMaxHp: 81,
  subsystems: { engine: 82 },
};
const second = {
  setup: { armor: { port: 0, starboard: 0 } },
  position: { x: 950, y: 500 },
  hullHp: 68,
  hullMaxHp: 72,
  shieldHp: 0,
  shieldMaxHp: 88,
};
const armoredRam = usefulRamAttempt(first, second);
assert.equal(armoredRam, true, 'shieldless Mk VI bow may ram an inferior hull');
first.setup.armor.front = 0;
const bareRam = usefulRamAttempt(first, second);
assert.equal(bareRam, false, 'unarmored zero-shield ram remains risky');
const origin = { x: 10, y: 50 };
const target = { x: 410, y: 50 };
const miss = missedShotEnd(origin, target);
assert.equal(miss.y, target.y, 'miss has no sideways deviation');
assert(miss.x > target.x && miss.x < target.x + 40);
const oppositeDepth = missedShotAbove(2) !== missedShotAbove(3);
assert(oppositeDepth, 'miss layer alternates above and below');
const weaponSource = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-weapons.ts'),
  'utf8'
);
assert(!weaponSource.includes('Math.cos(target.headingRadians + Math.PI / 2)'));
console.log('PASS full duel loadout, power brownout, armored ram and depth misses');
