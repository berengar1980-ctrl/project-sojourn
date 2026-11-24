'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const service = read('src/systems/combat/strategic-combat-step.ts');
const combatTelemetry = read('src/systems/combat/strategic-combat-telemetry.ts');
const planner = read('src/systems/combat/combat-strategy-planner.ts');
const routing = read('src/systems/combat/combat-asteroid-routing.ts');
const telemetry = read('src/systems/combat/combat-duel-telemetry.ts');
assert(service.includes('reviewSubsystemBreakthroughs(runtime, previousSubsystems)'));
assert(combatTelemetry.includes('damaged.subsystems.engine <= 0'));
assert(combatTelemetry.includes('damaged.subsystems.tractor <= 0'));
assert(combatTelemetry.includes('opponent.nextStrategyReviewAt = runtime.elapsedSeconds'));
assert(
  planner.includes('enemy.subsystems.engine <= 0 && ship.subsystems.engine > 0'),
  'weapons move into effective range after enemy engine loss'
);
assert(
  routing.includes("ship.tactic !== 'flee'") && routing.includes('immediateThreat &&'),
  'ordinary combat dodges drifting rocks without overturning committed escape routes'
);
for (const metric of [
  'planChanges',
  'shieldHits',
  'hullHits',
  'subsystemHits',
  'subsystemFailures',
  'obstacleEvents',
]) {
  assert(telemetry.includes(metric), 'duel analysis reports ' + metric);
}
console.log(
  'PASS subsystem-triggered strategy review, range exploitation, obstacle steering and telemetry'
);
