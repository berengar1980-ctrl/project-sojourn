'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DOC_PATH = 'docs/VOIDBOUND_FEATURE_PARITY.md';
const EXPECTED_FEATURES = 241;
const VALID_STATUSES = new Set([
  '✅ Umgesetzt',
  '🟨 Teilweise',
  '⬜ Offen',
  '🔁 Bewusst anders',
]);
const VALID_DECISIONS = new Set(['offen', 'übernehmen', 'ändern', 'verwerfen', 'später']);
const FEATURE_BEARING_PREFIXES = ['src/', 'tests/', 'resources/'];

function parseFeatureRows(content) {
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(\n      /^\\|\\s*(✅ Umgesetzt|🟨 Teilweise|⬜ Offen|🔁 Bewusst anders)\\s*\\|\\s*`([^`]+)`\\s*\\|/\n    );
    if (!match) continue;
    const decisionMatch = line.match(/\|\s*(offen|übernehmen|ändern|verwerfen|später)\s*\|\s*$/);
    rows.push({
      status: match[1],
      id: match[2],
      decision: decisionMatch ? decisionMatch[1] : null,
      line,
    });
  }
  return rows;
}

function validateParityDocument(root = path.resolve(__dirname, '..')) {
  const absolutePath = path.join(root, DOC_PATH);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing ${DOC_PATH}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const rows = parseFeatureRows(content);

  if (rows.length !== EXPECTED_FEATURES) {
    throw new Error(
      `${DOC_PATH} must contain exactly ${EXPECTED_FEATURES} feature rows; found ${rows.length}.`
    );
  }

  const ids = new Set();
  for (const row of rows) {
    if (!VALID_STATUSES.has(row.status)) {
      throw new Error(`Invalid parity status for ${row.id}: ${row.status}`);
    }
    if (!row.decision || !VALID_DECISIONS.has(row.decision)) {
      throw new Error(`Invalid or missing decision for ${row.id}.`);
    }
    if (ids.has(row.id)) {
      throw new Error(`Duplicate feature id in parity matrix: ${row.id}`);
    }
    ids.add(row.id);
  }

  if (!content.includes('## Verbindliche Merge-Regel')) {
    throw new Error('Parity matrix must retain the mandatory merge-review rule.');
  }
  if (!content.includes('## Review-Log')) {
    throw new Error('Parity matrix must retain the review log.');
  }

  return { featureCount: rows.length, rows };
}

function changedFilesSince(base, root = path.resolve(__dirname, '..')) {
  return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((entry) => entry.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

function needsParityReview(files) {
  return files.some((file) =>
    FEATURE_BEARING_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

function enforceChangedFileGate(files) {
  if (!needsParityReview(files)) return { required: false };

  if (!files.includes(DOC_PATH)) {
    const relevant = files.filter((file) =>
      FEATURE_BEARING_PREFIXES.some((prefix) => file.startsWith(prefix))
    );
    throw new Error(
      [
        'Feature parity review required.',
        `This PR changes feature-bearing files: ${relevant.join(', ')}`,
        `Review Voidbound parity and update ${DOC_PATH} before merge.`,
        'If no status changes, add a "keine Statusänderung" entry to the Review-Log.',
      ].join('\n')
    );
  }

  return { required: true };
}

function gitOutput(args, root = path.resolve(__dirname, '..')) {
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

function detectBaseRef(root = path.resolve(__dirname, '..')) {
  for (const candidate of ['origin/main', 'main']) {
    if (gitOutput(['rev-parse', '--verify', candidate], root)) return candidate;
  }
  return null;
}

function currentBranch(root = path.resolve(__dirname, '..')) {
  return gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], root);
}

function cliArgs(argv) {
  const baseIndex = argv.indexOf('--base');
  return {
    base: baseIndex >= 0 ? argv[baseIndex + 1] : null,
  };
}

function reviewCurrentBranch(root = path.resolve(__dirname, '..'), explicitBase = null) {
  const branch = currentBranch(root);
  if (branch === 'main') return { checked: false, required: false, base: null, files: [] };

  const base = explicitBase || detectBaseRef(root);
  if (!base) return { checked: false, required: false, base: null, files: [] };

  const files = changedFilesSince(base, root);
  const gate = enforceChangedFileGate(files);
  return { checked: true, required: gate.required, base, files };
}

function main() {
  const root = path.resolve(__dirname, '..');
  const validation = validateParityDocument(root);
  const { base } = cliArgs(process.argv.slice(2));
  const review = reviewCurrentBranch(root, base);

  if (review.checked) {
    console.log(
      `PARITY GATE OK · ${validation.featureCount} features · base ${review.base} · review ${\n        review.required ? 'required and present' : 'not required'\n      }`
    );
  } else {
    console.log(`PARITY DOCUMENT OK · ${validation.featureCount} unique features`);
  }
}

module.exports = {
  DOC_PATH,
  EXPECTED_FEATURES,
  VALID_STATUSES,
  VALID_DECISIONS,
  FEATURE_BEARING_PREFIXES,
  parseFeatureRows,
  validateParityDocument,
  changedFilesSince,
  needsParityReview,
  enforceChangedFileGate,
  detectBaseRef,
  currentBranch,
  reviewCurrentBranch,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
