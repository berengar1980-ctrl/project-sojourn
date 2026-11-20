'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(code, filename);
};
try {
  const { AsteroidSecurityDrone } = require(
    path.join(root, 'src/systems/operations/asteroid-security-drone.ts')
  );
  const { createFleetDroneInterceptor } = require(
    path.join(root, 'src/systems/combat/fleet-security-drone-interceptor.ts')
  );
  const drone = new AsteroidSecurityDrone(2000, 2000, []);
  const interceptor = createFleetDroneInterceptor(drone, []);
  const contacts = [
    { id: 'civilian', factionId: 'civilian', position: { x: 520, y: 500 }, operational: true },
    { id: 'pirate-a', factionId: 'pirate-a', position: { x: 800, y: 500 }, operational: true },
    { id: 'pirate-b', factionId: 'pirate-b', position: { x: 900, y: 500 }, operational: true },
    { id: 'far-pirate', factionId: 'pirate-b', position: { x: 1800, y: 1800 }, operational: true },
  ];
  assert.equal(interceptor.snapshot().targetId, null);
  let state = interceptor.tick(0.08, contacts);
  assert.equal(state.targetId, 'pirate-a');
  assert.deepEqual(state.detectedPirateIds, ['pirate-a', 'pirate-b']);
  assert.equal(state.inAttackRange, false);
  const start = { ...state.position };
  let reached = false;
  for (let i = 0; i < 250; i += 1) {
    state = interceptor.tick(0.08, contacts);
    if (state.inAttackRange) {
      reached = true;
      break;
    }
  }
  assert(reached, 'drone should fly to its target using campaign navigation');
  assert(
    Math.hypot(state.position.x - start.x, state.position.y - start.y) > 100,
    'drone actually traveled before engaging'
  );
  assert.equal(interceptor.tick(0.08, contacts.map((ship) => ({ ...ship, operational: false }))).targetId, null);
  assert.throws(() => createFleetDroneInterceptor(drone, [], 0), /Invalid drone combat engagement range/);
  console.log('PASS campaign drone sensory pursuit, faction filtering and physical approach');
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
