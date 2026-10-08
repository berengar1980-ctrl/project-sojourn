# Project Sojourn — agent instructions

These rules apply to all automated coding work in this repository, including new ChatGPT sessions.

## CI failures: evidence before edits (mandatory)

1. **Never repair a failing CI job by guessing.** Before modifying code or tests, identify the failed job, the exact failing command, and the relevant error output. A GitHub commit status such as `ci/diagnostic: tests = failure` is **not** a diagnostic log.
2. **Recover logs first.** CircleCI is the sole CI provider; open the failing CircleCI job and inspect the specific failed step output. GitHub Actions are unavailable due to known billing restrictions: do not suggest GitHub Actions workflows, configuration changes, or billing checks as a workaround. If the CircleCI job logs cannot be read through the available integration, ask the user for the exact error text or screenshot from CircleCI, without making speculative code changes.
3. **Stop if evidence is unavailable.** Immediately report the known CircleCI status, the missing diagnostic output, and the specific user action needed (if any). Never pretend that a GitHub commit status supplies the failed test output. Do not issue speculative fix commits or repeated reruns without evidence.
4. **Fix the verified cause, then test.** Use the project's scripts (`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run deps:check`, `npm run test:quick`, `npm run build`, or `npm run check:quick` as appropriate) before committing whenever an execution environment is available. If commands cannot be run locally, state that explicitly and rely on actual CI step logs.
5. **Avoid loops.** After one unsuccessful attempt, re-read the latest failing step output; do not keep changing formatting or tests based on guesses. Report blockers promptly, without waiting for repeated user prompts.
6. **Merge discipline.** Never merge a red or pending quality gate just because GitHub reports `mergeable: true`. Merge only once the required checks for the actual PR head are green and the user has authorized the merge.

## CI infrastructure

CircleCI runs the project checks. GitHub Actions are known to be billing-blocked; do not propose them as a diagnostic path. Use authorized CircleCI job logs or request the failing step output from the user. Never request, display, or commit CI secrets.

When troubleshooting this private repository, use authorized repository integrations; do not substitute public web search for private CI logs.
