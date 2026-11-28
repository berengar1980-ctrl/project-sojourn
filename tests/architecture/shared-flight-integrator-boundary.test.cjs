'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const sourceRoot = path.join(root, 'src');
const files = ts.sys.readDirectory(sourceRoot, ['.ts'], undefined, ['**/*.ts']);
const directIntegrators = [];
const nonShipPhysicsAllowlist = new Set([
  'src/systems/combat/combat-tractor-asteroid-throw.ts: rock.position.x +=',
  'src/systems/combat/combat-tractor-asteroid-throw.ts: rock.position.y +=',
  'src/systems/local-space/mining-chunk-service.ts: chunk.position =',
]);

function identifiers(node) {
  const names = new Set();
  function visit(current) {
    if (ts.isIdentifier(current)) names.add(current.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return names;
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment) {
      const left = node.left.getText(parsed);
      if (/\.position(?:\.(?:x|y))?$/.test(left)) {
        const names = identifiers(node.right);
        if (
          [...names].some((name) => name === 'velocity' || name === 'speed') &&
          [...names].some((name) => ['dt', 'deltaSeconds', 'seconds'].includes(name)) &&
          !file.endsWith(path.join('core', 'ship-flight-physics.ts'))
        ) {
          directIntegrators.push(
            `${path.relative(root, file)}: ${left} ${node.operatorToken.getText(parsed)}`
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

const unexpectedIntegrators = directIntegrators.filter(
  (write) => !nonShipPhysicsAllowlist.has(write)
);
assert.deepEqual(
  unexpectedIntegrators,
  [],
  'ship/field translation must use the shared integrator; direct position integration found'
);

const sharedProductionPaths = [
  'src/systems/combat/combat-inertial-thrust.ts',
  'src/systems/npcs/npc-sector-combat-movement.ts',
  'src/systems/local-space/local-space-autopilot.ts',
  'src/systems/navigation/field-ship-routing.ts',
  'src/systems/local-space/local-space-mining-formation.ts',
  'src/systems/local-space/local-space-station-keeping.ts',
  'src/systems/npcs/npc-mining-targets.ts',
];
for (const relative of sharedProductionPaths) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  assert(
    source.includes('applyShipVelocityCommand'),
    `${relative} must use shared velocity physics`
  );
}

const sharedTurningPaths = [
  'src/systems/combat/strategic-combat-movement.ts',
  'src/systems/npcs/npc-sector-combat-movement.ts',
  'src/systems/local-space/local-space-autopilot.ts',
  'src/systems/navigation/field-ship-routing.ts',
  'src/systems/local-space/local-space-mining-formation.ts',
  'src/systems/local-space/local-space-station-keeping.ts',
  'src/systems/npcs/npc-mining-targets.ts',
];
for (const relative of sharedTurningPaths) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  assert(source.includes('turnShipTowardHeading'), `${relative} must use shared turning`);
}

console.log('PASS shared flight boundary: no secondary ship integrators or turn implementations');
