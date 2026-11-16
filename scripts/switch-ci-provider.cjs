'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const circlePath = path.join(root, '.circleci/config.yml');
const githubPath = path.join(root, '.github/workflows/quality-gate.yml');

function switchCiProvider(provider, circleSource, githubSource) {
  if (provider !== 'github' && provider !== 'circleci') {
    throw new Error('Usage: node scripts/switch-ci-provider.cjs github|circleci');
  }
  const circleMatch = /(quality_gate_enabled:\s*\n\s*type: boolean\s*\n\s*default: )(true|false)/;
  const githubMatch = /(jobs:\s*\n\s*quality-gate:\s*\n\s*if: \$\{\{ )(true|false)( \}\})/;
  if (!circleMatch.test(circleSource) || !githubMatch.test(githubSource)) {
    throw new Error('CI switch markers missing: inspect both providers before changing them');
  }
  const circleEnabled = provider === 'circleci';
  const circle = circleSource.replace(circleMatch, (_, prefix) => prefix + circleEnabled);
  const github = githubSource.replace(
    githubMatch,
    (_, prefix, _current, suffix) => prefix + !circleEnabled + suffix
  );
  return { circle, github };
}

function run() {
  const provider = process.argv[2];
  const circleOriginal = fs.readFileSync(circlePath, 'utf8');
  const githubOriginal = fs.readFileSync(githubPath, 'utf8');
  const next = switchCiProvider(provider, circleOriginal, githubOriginal);
  if (next.circle !== circleOriginal) fs.writeFileSync(circlePath, next.circle);
  if (next.github !== githubOriginal) fs.writeFileSync(githubPath, next.github);
  console.log('Active CI: ' + provider);
  console.log('CircleCI configuration and stored credentials were not deleted or reset.');
  console.log('Commit both CI files together to activate the selection.');
}

if (require.main === module) run();

module.exports = { switchCiProvider };
