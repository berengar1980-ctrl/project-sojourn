# Combat choreography comparison (main versus PR #234)

This comparison measures **observable behavior**, not code structure. It does not change production combat decisions.

## Important routing limitation

`createStrategicCombatService` currently selects the Action/Reaction exchange controller **only for seed 1001**. Other seeds exercise the standard combat pilot. Results must be grouped by `mode`; never interpret 101/202/303 as exchange choreography tests. This limitation must be addressed in a separate, explicitly approved gameplay change, not hidden inside the harness.

## Reproducible procedure

Use separate, clean checkouts/worktrees at the exact commits that are being compared. The reporter and runner from PR #234 must be identical on both checkouts, so copy the **same** runner file into a temporary location in the main checkout. Never merge PR #234 into main just to compare.

From a Codespace currently on the PR branch:

```bash
git fetch origin
mkdir -p /tmp/sojourn-comparison
git worktree add --detach /tmp/sojourn-comparison/main origin/main
git worktree add --detach /tmp/sojourn-comparison/pr HEAD
cp scripts/compare-combat-choreography.cjs /tmp/sojourn-comparison/main/scripts/
(cd /tmp/sojourn-comparison/main && npm ci && node scripts/compare-combat-choreography.cjs /tmp/sojourn-comparison/main.json)
(cd /tmp/sojourn-comparison/pr && npm ci && node scripts/compare-combat-choreography.cjs /tmp/sojourn-comparison/pr.json)
node scripts/report-combat-comparison.cjs /tmp/sojourn-comparison/main.json /tmp/sojourn-comparison/pr.json > /tmp/sojourn-comparison/report.md
```

Worktree prerequisites: original working tree must be clean; `npm ci` requires a working lockfile and network/package cache. Paths under `/tmp` are local diagnostic outputs, not game save files.

The JSON records 0.08-second simulation runs with seeds 1001, 101, 202 and 303 for frontal/frontal, frontal/broadside, unequal speeds, obstacle, minefield and escape scenarios. It records trajectories every 0.8 seconds, distance travelled, mean and peak speed, stationary time (<5 m/s), coarse heading mismatch, intent changes, range encounters, plans, completed exchanges, impacts, mines and escape distance.

## Interpretation

- Inspect trajectories, passage completion and actual movement together. More distance is not automatically better: endless orbiting can inflate it.
- `closePasses` counts entries into a 300 m proximity band, **not** verified pass-throughs; actual spatial crossing must still be reviewed from the trajectories.
- `headingMismatchSeconds` is only a coarse backwards-facing indicator for frontal/aiming status labels, not a validated weapon firing-arc test.
- Impact events are not equivalent to all emitted projectiles or shots.
- Seeds outside 1001 are intentionally classified `standard`; do not mix their data with `exchange`.
- The runner is diagnostic: there are no arbitrary pass/fail gameplay thresholds until the actual baseline results have been reviewed.
- A good automated outcome does not replace manual verification of apparent motion, weapon posture, and believable attack/reaction passages.

## Gate

Run `npm run check:quick` and `npm run build` on PR #234, verify CircleCI and play both variants before merging. No automatic merge.
