# Project Sojourn — agent instructions

These rules apply to all automated coding work in this repository, including new ChatGPT sessions.

## CI failures: evidence before edits (mandatory)

1. **Never repair a failing CI job by guessing.** Before modifying code or tests, identify the failed job, the exact failing command, and the relevant error output. A GitHub commit status such as `ci/diagnostic: tests = failure` is **not** a diagnostic log.
2. **Recover logs first.** CircleCI is the CI provider. Check the linked CircleCI build and its failed step output. If direct CircleCI log access is missing, check the GitHub Actions workflow `.github/workflows/circleci-failure-logs.yml` (`CircleCI failure logs`, restored in PR #163). When available, manually dispatch it with the failing CircleCI job number, then read its job summary or `circleci-failure-logs` artifact. Its repository secret is named `CIRCLECI_API_TOKEN`; never request, display, or commit the token itself.
3. **Stop if evidence is unavailable.** Immediately tell the user: what CI status is known, what specific log is inaccessible, and whether a GitHub Actions permission/billing, secret, workflow or connector issue prevents retrieval. Ask for one precise action only if needed. Do not issue speculative fix commits, repeat CI reruns without a change supported by evidence, or claim to have diagnosed the root cause.
4. **Fix the verified cause, then test.** Use the project's scripts (`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run deps:check`, `npm run test:quick`, `npm run build`, or `npm run check:quick` as appropriate) before committing whenever an execution environment is available. If commands cannot be run locally, state that explicitly and rely on actual CI step logs.
5. **Avoid loops.** After one unsuccessful attempt, re-read the latest failing step output; do not keep changing formatting or tests based on guesses. Report blockers promptly, without waiting for repeated user prompts.
6. **Merge discipline.** Never merge a red or pending quality gate just because GitHub reports `mergeable: true`. Merge only once the required checks for the actual PR head are green and the user has authorized the merge.

## Workflow availability

The log-retrieval workflow requires GitHub Actions to be enabled and able to execute, plus the `CIRCLECI_API_TOKEN` repository secret. A merged PR introducing the workflow does not prove that it still exists on `main`; verify the file and workflow execution on the current revision before relying on it.

When troubleshooting a private repository, use authorized repository integrations; do not substitute public web search for private CI logs.
