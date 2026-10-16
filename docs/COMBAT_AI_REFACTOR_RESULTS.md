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

## Aiming quality and deliberately rejected alternatives

All figures below are per-scenario mean **seconds inside an actual firing arc** over 90 s, followed by the total *detected close-pass candidates* across four seeds. These are measured CI outcomes, not qualitative claims about cinematography.

- **Initially unified movement** (CI 4385, commit `c2f0618`): forward vs broadside 7 s and 16 passes; fast vs slow 7 s and 10 passes; two forward guns approximately 5 s per ship and 2 passes.
- **Continuous forward-gun tracking** (CI 4400, commit `b72a5e0`): forward vs broadside 21 s and 0 passes; fast vs slow 30 s and 10 passes; two forward guns 81 s per ship and 0 passes. More firing opportunity, but a severe loss of close encounters in two scenarios. Rejected.
- **Tracking only during intercept/engagement** (CI 4404, commit `4f87c7d`): forward vs broadside 7 s and 10 passes; fast vs slow 7 s and 12 passes; two forward guns 34–35 s and 2 passes. Mean combined damage was 23, 19 and 16 HP respectively; common slow-flight time stayed near 0.4%. Preferred compromise.
- **Additional aim during direction-compatible flybys** (CI 4407, commit `1f9047b`): forward vs broadside 8 s and 4 passes; fast vs slow 7 s and 6 passes; two forward guns 39 s and 2 passes. Too little aiming gain for the loss of encounters; rejected.

The preferred engagement-only selection has been retained while extracting its logic into one bounded-complexity `chooseWeaponPosture` function; the final equivalent refactor commit awaits its own CI check. The two ships still select their maneuver independently; no scripted paired reactions or forced pass quota exist.

The lack of a winner inside 90 seconds is not itself evidence of ineffective AI: the fixtures each start with 150 shield HP, and Tier 1 railgun/autocannon families have low native shield damage relative to their hull damage and cooldown. Do not modify the combat balance to make these diagnostic fixtures end artificially sooner.

## Interpretation and outstanding quality gates

1. **More motion is not sufficient for cinema or tactical competence.** No seeded duel produced a winner inside 90 seconds, before or after the refactor. Investigate weapon usage, actual shield/hull damage, arcs, and effective exposure without modifying weapon stats or hit probabilities on a hunch.
2. The "close-pass candidate" detector is a limited range-trend heuristic; it does not validate visually convincing flybys. Avoid optimising to candidate count alone.
3. The benchmark records shield/hull HP lost, impact-frame counts, seconds in weapon range and seconds in the actual firing arc. Compare these alongside velocity and close-pass candidates; no single numeric measure proves cinematic quality.
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
