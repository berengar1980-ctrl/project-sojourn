'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

// The CI checkout fetches main history. This complements the byte-level
// baseline guard by protecting *all* existing combat modules, including
// obscure weapon/physics/render helpers not on the fixed hash list.
let mainAvailable = true;
try {
  execFileSync('git', ['rev-parse', '--verify', 'refs/remotes/origin/main'], {
    cwd: root,
    stdio: 'pipe',
  });
} catch {
  mainAvailable = false;
}

if (mainAvailable) {
  const changed = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      'origin/main...HEAD',
      '--',
      'src/systems/combat',
      'src/ui/combat',
      'src/ui/start/duel-lobby.ts',
      'src/ui/start/duel-combatant-setup.ts',
    ],
    { cwd: root, encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const allowed = new Set([
    'src/systems/combat/combat-engagement-manager.ts',
    'src/systems/combat/fleet-combat-service.ts',
    'src/systems/combat/fleet-faction-policy.ts',
    'src/systems/combat/fleet-security-drone-interceptor.ts',
    'src/systems/combat/fleet-career-npc-adapter.ts',
    'src/systems/combat/fleet-career-mining-bridge.ts',
  ]);
  const unexpected = changed.filter((file) => !allowed.has(file));
  assert.deepEqual(
    unexpected,
    [],
    'FleetCombat must NOT modify any existing 1vs1 combat, renderer or setup modules'
  );
  console.log('PASS all existing 1vs1 combat modules unchanged relative to main');
} else {
  // The fixed-SHA guard still executes via fleet-legacy-baseline.test.cjs.
  console.log(
    'SKIP branch-wide 1vs1 diff (origin/main not present); fixed-SHA baseline remains active'
  );
}
