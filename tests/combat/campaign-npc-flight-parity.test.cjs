'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { advanceNpcCombatMovement, createNpcCombatMovementState } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-sector-combat-movement.ts'
);
const { npcOperationalSpeed } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-upgrade-service.ts'
);
const { performCombatThrust } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);

const dt = 0.08;
const turnRateRadiansPerSecond = 1.15;
const arena = { width: 100_000, height: 100_000, useFieldBounds: true };

function createNpc(mode, headingRadians, velocity) {
  const npc = {
    id: 'campaign-npc',
    name: 'campaign-npc',
    job: 'patrol',
    shipId: 'patrol-60m-variant-01',
    hullHp: 100,
    hullMaxHp: 100,
    fuel: 10_000,
    fuelUse: 1,
    installedComponents: {},
  };
  const speed = npcOperationalSpeed(npc);
  npc.combatMovement = createNpcCombatMovementState(
    mode,
    'player',
    'target',
    { x: 10_000, y: 10_000 },
    velocity,
    headingRadians
  );
  return { npc, speed };
}

function createCombatant(id, speed, acceleration, headingRadians, velocity) {
  return {
    id,
    name: id,
    position: { x: 10_000, y: 10_000 },
    velocity: { ...velocity },
    headingRadians,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
    longitudinalThrust: 0,
    boostActive: false,
    shieldHp: 100,
    hullHp: 100,
    subsystems: { engine: 100, tractor: 0 },
    setup: {
      id: 'campaign-parity-hull',
      combatSpeed: speed,
      accelerationMetersPerSecond2: acceleration,
      turnRateRadiansPerSecond,
      tractorRangeMeters: 0,
      weapons: [],
      weaponMounts: [],
    },
  };
}

function assertPoseParity(actual, expected, label) {
  for (const axis of ['x', 'y']) {
    assert.ok(
      Math.abs(actual.position[axis] - expected.position[axis]) < 1e-8,
      `${label} position.${axis}`
    );
    assert.ok(
      Math.abs(actual.velocity[axis] - expected.velocity[axis]) < 1e-8,
      `${label} velocity.${axis}`
    );
  }
  assert.ok(Math.abs(actual.headingRadians - expected.headingRadians) < 1e-8, `${label} heading`);
  assert.ok(
    Math.abs(actual.turnRateRadiansPerSecond - expected.turnRateRadiansPerSecond) < 1e-8,
    `${label} turn rate`
  );
}

for (const scenario of [
  {
    mode: 'pursue',
    heading: 0,
    velocity: { x: 20, y: 0 },
    direction: { x: 1, y: 0 },
    factor: 1.08,
  },
  {
    mode: 'flee',
    heading: Math.PI,
    velocity: { x: -35, y: 0 },
    direction: { x: -1, y: 0 },
    factor: 1.05,
  },
]) {
  const { npc, speed } = createNpc(scenario.mode, scenario.heading, scenario.velocity);
  const targetSpeed = speed * scenario.factor;
  const acceleration = Math.max(15, speed * 0.85);
  const combatant = createCombatant(
    'comparison',
    targetSpeed,
    acceleration,
    scenario.heading,
    scenario.velocity
  );
  const enemy = {
    position: { x: 20_000, y: 10_000 },
    velocity: { x: 0, y: 0 },
    headingRadians: 0,
    shieldHp: 100,
    hullHp: 100,
    subsystems: { engine: 100, tractor: 0 },
    setup: { tractorRangeMeters: 0 },
  };
  const target = { x: 20_000, y: 10_000 };

  for (let frame = 0; frame < 40; frame += 1) {
    advanceNpcCombatMovement({ width: arena.width, height: arena.height }, npc, target, dt);
    performCombatThrust(combatant, enemy, dt, arena, scenario.direction, 1);
    assertPoseParity(npc.combatMovement, combatant, `${scenario.mode} frame ${frame}`);
  }
}

console.log('PASS campaign NPC pursuit and escape match the shared PvP flight integrator');
