'use strict';

const { spawn } = require('node:child_process');

const MAX_DESCRIPTION_LENGTH = 140;
const MAX_CAPTURE_LENGTH = 200000;

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value, limit = MAX_DESCRIPTION_LENGTH) {
  const clean = compact(value);
  return clean.length <= limit ? clean : clean.slice(0, limit - 1) + '…';
}

function normalizeFile(value) {
  return value
    .replace(process.cwd().replaceAll('\\', '/') + '/', '')
    .replaceAll('\\', '/')
    .trim();
}

function firstMatchingLine(lines, matcher) {
  return lines.find((line) => matcher.test(line)) ?? null;
}

function extractDiagnostic(output, label) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const failedTest = firstMatchingLine(lines, /^FAIL\s+.+\.test\.cjs\b/);
  if (failedTest) return truncate(label + ': ' + failedTest);

  const prettierFile = firstMatchingLine(
    lines,
    /^\[warn\]\s+.+\.(?:ts|tsx|js|cjs|mjs|json|md|yml|yaml|html)$/
  );
  if (prettierFile) return truncate(label + ': ' + prettierFile.replace(/^\[warn\]\s+/, ''));

  const typeScriptError = firstMatchingLine(lines, /\.(?:ts|tsx)\(\d+,\d+\):\s+error\s+TS\d+:/);
  if (typeScriptError) return truncate(label + ': ' + normalizeFile(typeScriptError));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\.(?:ts|tsx|js|cjs|mjs)$/.test(line)) continue;
    const nearby = lines.slice(index + 1, index + 4).find((next) => /\berror\b/i.test(next));
    if (nearby) return truncate(label + ': ' + normalizeFile(line) + ' — ' + nearby);
  }

  const architectureError = firstMatchingLine(
    lines,
    /circular imports found|layer violations found/i
  );
  if (architectureError) return truncate(label + ': ' + architectureError);

  const assertion = firstMatchingLine(
    lines,
    /AssertionError(?:\s+\[ERR_ASSERTION\])?:|Error:\s+.+/
  );
  if (assertion) return truncate(label + ': ' + assertion);

  const buildError = firstMatchingLine(lines, /error during build|build failed|\[vite:.+\]/i);
  if (buildError) return truncate(label + ': ' + buildError);

  const fallback = [...lines].reverse().find((line) => !/^npm (?:error|warn)/i.test(line));
  return truncate(label + ': ' + (fallback ?? 'command failed'));
}

function extractDetail(output, primary) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const assertionIndex = lines.findIndex((line) =>
    /AssertionError(?:\s+\[ERR_ASSERTION\])?:/.test(line)
  );
  if (assertionIndex >= 0) {
    const detail = lines[assertionIndex + 1] ?? lines[assertionIndex];
    const result = truncate(detail);
    if (!primary.includes(result)) return result;
  }

  const errorLine = lines.find((line) => /\berror\b/i.test(line) && !primary.includes(line));
  return errorLine ? truncate(errorLine) : null;
}

// GitHub commit status descriptions are limited to 140 characters.
// Publish a small, bounded set of distinct error lines as separate check contexts.
function extractDiagnosticLines(output, primary, maxLines = 5) {
  const candidates = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const relevant = candidates.filter((line) =>
    /^(?:FAIL\s|\[warn\]\s+.+\.(?:ts|tsx|js|cjs|mjs|json|md|yml|yaml|html)$|.*\.(?:ts|tsx)\(\d+,\d+\):\s+error TS\d+:|.*\berror\b|.*\bAssertionError\b|.*\bExpected values to be strictly equal\b|.*\bactual:|.*\bexpected:|.*\bnot ok\b|.*\bfailed\b)/i.test(
      line
    )
  );
  const unique = [];
  const seen = new Set([compact(primary)]);
  for (const line of relevant) {
    const clean = truncate(normalizeFile(line));
    if (seen.has(clean) || !clean) continue;
    seen.add(clean);
    unique.push(clean);
    if (unique.length >= maxLines) break;
  }
  return unique;
}

async function postStatus(state, label, description) {
  const token = process.env.SOJOURN_GITHUB_STATUS_TOKEN;
  const owner = process.env.CIRCLE_PROJECT_USERNAME;
  const repository = process.env.CIRCLE_PROJECT_REPONAME;
  const sha = process.env.CIRCLE_SHA1;

  if (!token || !owner || !repository || !sha) {
    console.warn(
      'CI DIAGNOSTIC: GitHub status reporting unavailable; required environment is missing.'
    );
    return false;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/statuses/${sha}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'project-sojourn-circleci',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        state,
        context: 'ci/diagnostic: ' + label,
        description: truncate(description),
        target_url: process.env.CIRCLE_BUILD_URL || undefined,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    console.warn(
      `CI DIAGNOSTIC: GitHub status update failed (${response.status}): ${truncate(body, 220)}`
    );
    return false;
  }
  return true;
}

async function run() {
  const args = process.argv.slice(2);
  const separator = args.indexOf('--');
  if (separator !== 1 || args.length < 3) {
    console.error('Usage: node scripts/ci-run-and-report.cjs <label> -- <command> [args...]');
    process.exitCode = 2;
    return;
  }

  const label = args[0];
  const command = args[2];
  const commandArgs = args.slice(3);
  await postStatus('pending', label, label + ' running');

  let captured = '';
  const append = (chunk) => {
    captured = (captured + chunk.toString()).slice(-MAX_CAPTURE_LENGTH);
  };

  const exitCode = await new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      append(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      append(chunk);
    });
    child.on('error', (error) => {
      const message = String(error?.stack || error);
      process.stderr.write(message + '\n');
      append(message);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode === 0) {
    await postStatus('success', label, label + ' passed');
    return;
  }

  const diagnostic = extractDiagnostic(captured, label);
  await postStatus('failure', label, diagnostic);
  const detail = extractDetail(captured, diagnostic);
  const lines = extractDiagnosticLines(captured, diagnostic);
  if (detail && !lines.includes(detail)) lines.unshift(detail);
  for (const [index, line] of lines.slice(0, 5).entries()) {
    await postStatus(
      'failure',
      label + ' error ' + (index + 1) + ': ' + truncate(line, 72),
      line
    );
  }
  process.exitCode = exitCode;
}

async function smoke() {
  const success = await postStatus(
    'success',
    'smoke',
    'CircleCI can write readable GitHub diagnostics'
  );
  if (!success) process.exitCode = 1;
}

if (require.main === module) {
  const entry = process.argv[2] === '--smoke' ? smoke : run;
  entry().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  extractDiagnostic,
  extractDetail,
  extractDiagnosticLines,
  truncate,
};
