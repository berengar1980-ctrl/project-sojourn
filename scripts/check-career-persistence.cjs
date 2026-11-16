'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REVIEW_PATH = 'docs/CAREER_PERSISTENCE.md';
const OWNERS_PATH = 'docs/CAREER_PERSISTENCE_OWNERS.json';
const FEATURE_PREFIXES = ['src/', 'resources/'];
const VALID_MODES = new Set(['persisted', 'derived', 'transient']);

function changedFiles(base, root = path.resolve(__dirname, '..')) {
  return execFileSync('git', ['diff', '--name-status', '--diff-filter=ACMR', base + '...HEAD'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const columns = line.split('\t');
      return {
        status: columns[0][0],
        path: columns[columns.length - 1].replaceAll('\\', '/'),
      };
    });
}

function isFeatureFile(file) {
  return FEATURE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function validateOwners(owners, root) {
  if (
    !owners ||
    owners.version !== 1 ||
    !owners.modules ||
    Array.isArray(owners.modules) ||
    typeof owners.modules !== 'object'
  ) {
    throw new Error('Invalid career persistence owner registry');
  }
  for (const [file, decision] of Object.entries(owners.modules)) {
    if (
      !file.startsWith('src/systems/') ||
      !file.endsWith('.ts') ||
      !fs.existsSync(path.join(root, file))
    ) {
      throw new Error('Invalid or missing domain module in owner registry: ' + file);
    }
    if (
      !decision ||
      !VALID_MODES.has(decision.mode) ||
      typeof decision.reason !== 'string' ||
      decision.reason.trim().length < 15
    ) {
      throw new Error('Missing persistence decision/reason for ' + file);
    }
    if (decision.mode === 'persisted') {
      if (
        typeof decision.checkpoint !== 'string' ||
        !decision.checkpoint.startsWith('src/') ||
        !fs.existsSync(path.join(root, decision.checkpoint))
      ) {
        throw new Error(`Missing checkpoint adapter for ${file}`);
      }
      if (
        typeof decision.test !== 'string' ||
        !decision.test.startsWith('tests/') ||
        !fs.existsSync(path.join(root, decision.test))
      ) {
        throw new Error(`Missing checkpoint regression test for ${file}`);
      }
    }
  }
}

function enforcePersistenceReview(changes, owners) {
  const features = changes.filter((entry) => isFeatureFile(entry.path));
  if (!features.length) return { required: false, addedModules: [] };
  if (!changes.some((entry) => entry.path === REVIEW_PATH)) {
    throw new Error(`Career persistence impact review required: update ${REVIEW_PATH}`);
  }
  const addedModules = features
    .filter((entry) => entry.status === 'A')
    .map((entry) => entry.path)
    .filter((file) => file.startsWith('src/systems/') && file.endsWith('.ts'));
  for (const file of addedModules) {
    if (!Object.hasOwn(owners.modules, file)) {
      throw new Error(`New domain module missing persistence classification: ${file}`);
    }
  }
  if (addedModules.length && !changes.some((entry) => entry.path === OWNERS_PATH)) {
    throw new Error('New domain modules require an updated ' + OWNERS_PATH);
  }
  return { required: true, addedModules };
}

function git(args, root) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function reviewCurrentBranch(root = path.resolve(__dirname, '..')) {
  const owners = JSON.parse(fs.readFileSync(path.join(root, OWNERS_PATH), 'utf8'));
  validateOwners(owners, root);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  if (branch === 'main' || branch === 'master') return { checked: false, required: false };
  const base = ['origin/main', 'main'].find((candidate) =>
    git(['rev-parse', '--verify', candidate], root)
  );
  if (!base) throw new Error('Cannot verify persistence review: main ref unavailable.');
  const changes = changedFiles(base, root);
  return { checked: true, base, ...enforcePersistenceReview(changes, owners) };
}

module.exports = {
  REVIEW_PATH,
  OWNERS_PATH,
  isFeatureFile,
  validateOwners,
  enforcePersistenceReview,
  reviewCurrentBranch,
};

if (require.main === module) {
  try {
    const result = reviewCurrentBranch();
    const status = result.checked ? 'review checked' : 'main baseline';
    console.log(`CAREER PERSISTENCE GATE OK · ${status}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
