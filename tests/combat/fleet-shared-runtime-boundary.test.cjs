'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const modules = [
  'src/systems/combat/fleet-combat-service.ts',
  'src/systems/combat/combat-engagement-manager.ts',
  'src/systems/combat/fleet-faction-policy.ts',
  'src/systems/combat/fleet-security-drone-interceptor.ts',
  'src/systems/combat/fleet-career-mining-bridge.ts',
  'src/systems/combat/fleet-combat-lifecycle.ts',
];

for (const file of modules) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(
    !/from\s+['"][^'"]*(?:\/ui\/|\/app\/)/.test(source),
    'The productive FleetCombat system must never import UI or app-layer logic: ' + file
  );
}

const fleet = fs.readFileSync(
  path.join(root, 'src/systems/combat/fleet-combat-service.ts'),
  'utf8'
);
const lobby = fs.readFileSync(path.join(root, 'src/ui/start/fleet-test-lobby.ts'), 'utf8');
const lifecycle = fs.readFileSync(
  path.join(root, 'src/systems/combat/fleet-combat-lifecycle.ts'),
  'utf8'
);
assert(
  !lifecycle.includes("from './fleet-combat-service'"),
  'shared lifecycle module cannot depend on its FleetCombat consumer'
);
assert(fleet.includes('export function createFleetCombatService('));
assert(
  lobby.includes("from '../../systems/combat/fleet-combat-service'"),
  'PvP scenario UI must use the same systems-level FleetCombat factory as career'
);
assert(
  !/createFleetCombatService\s*\(/.test(
    fleet.slice(0, fleet.indexOf('export function createFleetCombatService('))
  ),
  'Do not instantiate duplicate combat services within the shared runtime'
);

// Mandatory FC-25 CI guard; campaign parity still requires replay tests.
// FC-19/FC-25 remain OPEN until both entrypoints pass them.
console.log('PASS FleetCombat runtime independent of test UI; PvP calls systems factory');
