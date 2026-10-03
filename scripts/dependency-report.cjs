'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('acorn');
const { runtimeFiles } = require('./source-files.cjs');

const root = path.resolve(__dirname, '..');
const write = process.argv.includes('--write');
const files = runtimeFiles(root);
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');

function importsFor(file) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const imports = [];
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration' || !node.source.value.startsWith('.')) continue;
    let target = path.resolve(path.dirname(file), node.source.value);
    if (!path.extname(target)) target += '.js';
    if (fs.existsSync(target)) imports.push(target);
  }
  return imports;
}

const graph = Object.fromEntries(files.map((file) => [rel(file), importsFor(file).map(rel)]));

function findCycles() {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      cycles.push([...stack.slice(stack.indexOf(node)), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph[node] || []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of Object.keys(graph)) visit(node);
  return cycles;
}

const rank = { core: 0, data: 0, systems: 1, features: 2, ui: 3, app: 4 };
const layerOf = (file) => /^src\/([^/]+)\//.exec(file)?.[1] || null;
const violations = [];

for (const [from, targets] of Object.entries(graph)) {
  const fromLayer = layerOf(from);
  for (const to of targets) {
    const toLayer = layerOf(to);
    if (fromLayer === 'core' && !['core', 'data'].includes(toLayer)) {
      violations.push(`${from} -> ${to}: core may only depend on core/data`);
    } else if (fromLayer === 'data' && !['core', 'data'].includes(toLayer)) {
      violations.push(`${from} -> ${to}: data may only depend on core/data`);
    } else if (
      fromLayer !== 'app' &&
      rank[fromLayer] != null &&
      rank[toLayer] != null &&
      rank[toLayer] > rank[fromLayer]
    ) {
      violations.push(`${from} -> ${to}: dependency points toward a higher layer`);
    }
  }
}

const cycles = findCycles();
const report = { generatedBy: 'scripts/dependency-report.cjs', modules: graph, cycles, layerViolations: violations };

if (write) {
  const outDir = path.join(root, 'docs', 'generated');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'dependency-graph.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('WROTE docs/generated/dependency-graph.json');
} else {
  assert.deepEqual(cycles, [], `circular imports found:\n${cycles.map((c) => c.join(' -> ')).join('\n')}`);
  assert.deepEqual(violations, [], `layer violations found:\n${violations.join('\n')}`);
  console.log(`PASS dependency architecture: ${files.length} ES modules, no cycles, no layer violations`);
}
