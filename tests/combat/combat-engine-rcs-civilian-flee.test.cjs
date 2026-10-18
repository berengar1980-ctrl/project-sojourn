'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const ships = load('src/systems/ships/ship-registry.ts').getAllShipDefinitions();
const stats = load('src/systems/ships/ship-stats.ts');
const autopilot = load('src/systems/local-space/local-space-autopilot.ts');
const nav = load('src/systems/navigation/navigation-service.ts');
const npcSetup = load('src/systems/combat/npc-combatant-setup.ts');
const commitment = load('src/systems/combat/combat-commitment.ts');

for (const role of ['patrol', 'mining', 'salvage', 'freighter']) {
  const hull = ships.find((candidate) => candidate.role === role);
  assert(hull);
  const baseline = stats.resolveShipCombatMovementStats(hull, { engine: ['engine1'] });
  const upgraded = stats.resolveShipCombatMovementStats(hull, { engine: ['engine6'] });
  assert(
    Math.abs(upgraded.turnRateRadiansPerSecond / baseline.turnRateRadiansPerSecond - 1.78) < 1e-10
  );
  assert(upgraded.combatSpeed > baseline.combatSpeed);
}
function localShip() {
  return {
    position: { x: 0, y: 0 },
    headingRadians: 0,
    speed: 0,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
  };
}
const route = [{ x: 0, y: 0 }, { x: 0, y: 300 }];
const normalLocal = localShip();
const upgradedLocal = localShip();
autopilot.advanceAutopilotRoute(normalLocal, route, 1, 78, 0.1, false, false, 1);
autopilot.advanceAutopilotRoute(upgradedLocal, route, 1, 78, 0.1, false, false, 1.78);
assert(Math.abs(upgradedLocal.headingRadians / normalLocal.headingRadians - 1.78) < 1e-10);
const sector = {
  locations: [{ id: 'start', position: { x: 0, y: 0 } }],
  width: 2000,
  height: 1200,
};
const normalNav = nav.createNavigationService(sector, 'start', 220);
const enhancedNav = nav.createNavigationService(sector, 'start', 220);
normalNav.startPursuit('target', { x: 0, y: 500 });
enhancedNav.setTurnRateMultiplier(1.78);
enhancedNav.startPursuit('target', { x: 0, y: 500 });
const a = normalNav.tick(0.1);
const b = enhancedNav.tick(0.1);
assert(Math.abs(b.turnRateRadiansPerSecond / a.turnRateRadiansPerSecond - 1.78) < 1e-10);

for (const job of ['miner', 'salvager']) {
  const npc = { job, aggression: 15, hullHp: 100, hullMaxHp: 100 };
  assert.equal(npcSetup.npcCombatDoctrine(npc, false, true), 'fight');
  assert.equal(npcSetup.npcCombatDoctrine(npc, false, false), 'flee');
  assert.equal(npcSetup.npcCombatDoctrine(npc, true, true), 'minefield');
  assert.equal(npcSetup.npcCombatDoctrine({ ...npc, hullHp: 22 }, false, true), 'flee');
}
function fighter(id, x) {
  return {
    setup: {
      shipId: id,
      aiControlled: true,
      aiAggression: 15,
      weapons: [{
        weapon: {
          family: 'pulse_laser',
          mount: 'turret',
          shieldDamage: 24,
          hullDamage: 14,
          cooldownSeconds: 1,
          rangeMeters: 1000,
        },
      }],
      combatSpeed: 78,
      turnRateRadiansPerSecond: 0.5,
      hitChance: 0.75,
      dodgeChance: 0,
    },
    position: { x, y: 500 },
    velocity: { x: 0, y: 0 },
    shieldHp: 100,
    shieldMaxHp: 100,
    hullHp: 100,
    hullMaxHp: 100,
    subsystems: { engine: 100, tractor: 0 },
    mineStock: [],
    tactic: 'fight',
    strategy: null,
  };
}
const miner = fighter('mining-80m-variant-01', 800);
const salvager = fighter('salvage-100m-variant-01', 1400);
const combatArena = { width: 2400, height: 1100, exitPoint: { x: 100, y: 500 } };
assert.equal(commitment.estimatedVictoryChance(miner, salvager), 0.5);
commitment.reviewCombatCommitment(miner, salvager, combatArena, 0);
commitment.reviewCombatCommitment(salvager, miner, combatArena, 0);
assert.equal(
  miner.tactic,
  'fight',
  'armed miner should not immediately flee from an equal salvager'
);
assert.equal(
  salvager.tactic,
  'fight',
  'armed salvager should not immediately flee from an equal miner'
);
const overpoweringPirate = fighter('pirate-vessel', 1400);
overpoweringPirate.setup.weapons[0].weapon.shieldDamage = 240;
overpoweringPirate.setup.weapons[0].weapon.hullDamage = 140;
const threatened = fighter('mining-80m-variant-02', 800);
commitment.reviewCombatCommitment(threatened, overpoweringPirate, combatArena, 0);
assert.equal(threatened.tactic, 'flee', 'overmatched working ship should still choose escape');
console.log('PASS RCS drive scaling, civilian peer combat and defensive flight');
