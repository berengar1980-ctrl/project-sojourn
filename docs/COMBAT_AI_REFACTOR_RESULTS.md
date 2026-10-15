# Sojourn: Combat AI refactor — verified movement results

Measurements from CircleCI quality run 4339 on commit `f2789e1`, using twelve 90-second deterministic scenarios from `scripts/combat-motion-baseline.cjs`. The pre-refactor values originated from the user's Codespaces run and are preserved under `docs/combat-baselines/main-pre-refactor-2026-10-15.json`.

## Before: regular combat

- Both ships simultaneously below 15% configured maximum speed: **61.97%** of sampled combat time across nine ordinary-path fights.
- Longest shared low-speed period: **69.2 seconds**.
- Mean relative speed: approximately **26.8 m/s**.
- Detected close-pass candidates: **0** in the nine regular-path fixtures.
- None of the fights had a winner by 90 seconds.
- The 1001 scripted exchange path behaved differently; it was never considered the reference architecture to retain.

## After: unified independent combat AI

CircleCI published the following per-scenario-group results (four seeds per group, including 1001 now using exactly the same runtime path):

- **Forward gun vs broadside:** Both-slow **0.4%**; longest shared slowdown **0.3 seconds**; mean relative speed **154.4 m/s**; **16** close-pass candidates; **0/4** winners.
- **Fast vs slow ship:** Both-slow **0.4%**; longest shared slowdown **0.4 seconds**; mean relative speed **161.1 m/s**; **10** close-pass candidates; **0/4** winners.
- **Two forward guns:** Both-slow **0.4%**; longest shared slowdown **0.3 seconds**; mean relative speed **182.8 m/s**; **2** close-pass candidates; **0/4** winners.

The previous repeating 86–87 m, 4.2 m/s near-contact deadlock is **not present in these twelve traces**. These numbers show substantially more actual relative movement and no prolonged shared stall.

## Interpretation and outstanding quality gates

1. **More motion is not sufficient for cinema or tactical competence.** No seeded duel produced a winner inside 90 seconds, before or after the refactor. Investigate weapon usage, actual shield/hull damage, arcs, and effective exposure without modifying weapon stats or hit probabilities on a hunch.
2. The "close-pass candidate" detector is a limited range-trend heuristic; it does not validate visually convincing flybys. Avoid optimising to candidate count alone.
3. The newer benchmark code now records shield/hull HP lost by each ship and impact-frame counts. Re-run CircleCI and document the resulting damage values separately; do not invent them.
4. The old exchange-only flight, AI and planned reaction modules have been removed from active source. Canonical boost and ram physics are retained in `combat-boost-control.ts` and `combat-ram-impact.ts` without changing their tuning.
5. Thorough regression coverage remains required for escape, mines, tractor, collision, grapples, boarding, engine failure and all weapon mounts. A visual battle review remains outstanding.
6. Do not merge into `main` until the user explicitly authorizes it. The refactor branch is not acceptance of cinematic quality by itself.

## Reproduce

```bash
node scripts/combat-motion-baseline.cjs 90 > combat-motion-after.json
node scripts/combat-motion-baseline.cjs 90 --trace > combat-motion-after-trace.json
npm run check:full
```

CircleCI publishes brief metric descriptions in commit status contexts starting with `ci/diagnostic: motion`. The existing CI benchmark will fail if the old long shared slowdowns reappear.
