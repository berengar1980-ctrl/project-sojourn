# Project Sojourn — agent instructions

These rules apply to all automated coding work in this repository, including new ChatGPT sessions.

## Local field physics unification (mandatory)

Before working on local flight, collision, navigation, combat, mining or
salvage unification, read `docs/UNIFIED_FIELD_FLIGHT_ARCHITECTURE.md`.
It is the binding implementation plan and handover for
`refactor/unified-field-flight-physics`. Use the historical PvP 1vs1
reference first, then FleetCombat, then civilian campaign. Maintain the
package checklist and evidence log on every work increment. Do not mark
a package complete on the basis of helper reuse or green CI alone.
Do not preserve parallel physics implementations under a new wrapper.
Run the architecture-document test as part of the existing test gate.

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

## Mutable game state and future persistence (mandatory)

Project Sojourn is implementing a **versioned Career Save/Load** system. Continue the existing implementation in `docs/CAREER_PERSISTENCE.md`; do not add a competing save schema or independent save storage. The in-game Save/Load UI must wait until atomic full-session restore is validated.

1. Every new persistent-in-principle gameplay value (ownership, equipment, cargo, discoveries, credits, NPC equipment, or progression) must have one clearly identified domain owner. Avoid mutating it through HTML, DOM datasets, or view models.
2. When adding or changing such state, update its service's detached, JSON-compatible `snapshot()` or document why the data is transient. Keep snapshots observational: never expose the original mutable arrays, sets, or maps.
3. Add **behavioral** regression tests for snapshots and gameplay transactions. Test failed purchases/swaps leave state unchanged, consumed inventory components cannot be duplicated, and higher salvage bonuses replace only the same model and bonus kind. String-search tests alone are insufficient.
4. Player and NPC equipment, salvaging, and shipyard market rules must use the same canonical component definitions and shared research state; preserve real Mk tiers and distinct model IDs.
5. The ship test switcher is a development tool; **do not** restrict it based on ship ownership.
6. Run the existing `npm run check:quick` and `npm run build` gates. If a changed state owner has no snapshot or a new state field is absent from the relevant snapshot, treat the implementation as incomplete even when the build is green.
7. Keep domain snapshot APIs separate from the versioned Career Save contract. Integrate new authoritative state through a tested, staged restore path; snapshot presence alone does not imply a fully restorable Career Save.

Reference: `docs/SHIP_STATE_BOUNDARIES.md`. Update the document and tests when new state owners are introduced.

## Mandatory pre-push formatting and CI preflight

These rules apply to **every** coding agent and every feature branch.

1. Read `.prettierrc.json` and `package.json` before editing. Prettier is the
   only source of truth for line wrapping, and ESLint decides complexity limits.
   A 100-character line is **not** proof that Prettier will accept its layout.
2. In a working checkout with dependencies installed, run
   `npm run format`, then `npm run format:check`. Prettier must produce zero
   changes on a second pass. Do not hand-format or swap line breaks repeatedly.
3. Run `npm run lint`, `npm run typecheck`, `npm run deps:check`,
   `npm run persistence:check`, `npm run test:quick`, and `npm run build`
   **before pushing**. Fix all failures in the same working tree; repeat the
   checks after any fix affecting source or tests.
4. If Prettier or another required tool is unavailable, explicitly label the
   changes **unverified**. Do not claim a preflight passed. Prefer one batch
   of verified CI diagnostics, including the exact Prettier diff, over a chain
   of guessed one-line commits.
5. Avoid adding nested conditions to long service factories. Extract
   validators, checkpoint staging, and transaction logic into testable helpers
   before hitting the repository's ESLint complexity/length restrictions.
6. For new or changed gameplay state, update
   `docs/CAREER_PERSISTENCE.md` with its save impact. Classify newly added
   domain modules in `docs/CAREER_PERSISTENCE_OWNERS.json`.
7. Merge only after the required checks on the **latest PR head** have passed.
   Never weaken lint, format, or test rules to make a PR green.

Quick human-readable preflight:
`npm run format && npm run check:quick && npm run build`.
