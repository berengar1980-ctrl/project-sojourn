# Combat AI refactor — Phase 1 source audit

Source: `main` at `db740af379893c9ebcc8b17a3d1b93d52e2cf63a`, 2026-10-15. **Source review, not a completed implementation or simulated result.**

## Scope
Goal: watchable, emergent 2D two-ship combat without scripted action/reaction sequences, perpetual nose-on stops, infinite circling or rapid tactic changes. **Preserve** existing acceleration, RCS, boost, inertia, weapon families and arcs, shield/hull/subsystem damage, mines, tractor, asteroids, flee, grappling and boarding. No new gameplay features. No main merge without user approval.

## Actual runtime ownership
`strategic-combat-service.ts` routes `seed === 1001` into `combat-exchange-controller.ts` and all other seeds through `strategic-combat-telemetry.ts::reviewAndExecute` plus `strategic-combat-movement.ts::moveCombatant`. They are **two distinct control paths** within the same damage/weapons runtime.

**Regular path:** `combat-commitment.ts` owns fight/flee review, `combat-strategy-planner.ts` chooses doctrine, `combat-plan-executor.ts` handles weapon-alignment phases. `strategic-combat-movement.ts` combines range posture, tactics, collision, mine, obstacle, asteroid routing and weapon facing before `combat-inertial-thrust.ts` mutates velocity and position. Danger: `combat-range-posture.ts` uses an AI target-speed factor of `0.1` at desired range; aiming a broadside can cap it at `0.28`. `combat-tactical-maneuvers.ts` includes a relative braking maneuver; obstacle/cover goals can displace tactical goals.

**Exchange/reference path:** `combat-exchange-machine.ts` selects four named actions, one of three prescribed reactions, fixed 10/14-second durations and heavy action-repetition penalties. `combat-exchange-controller.ts` creates the exchange flight plan but can replace its goals with reactive, asteroid-cover or tactical ones. `combat-exchange-pilot.ts` reduces target speed using waypoint braking distance and mixes in 65% of opponent velocity inside 650 m; this can create a low-relative-speed equilibrium. `combat-exchange-outcome.ts` checks achieved geometry **after** the scheduler's timed execution. `combat-exchange-reactions.ts` can even set a reactive goal to the ship's own current position on shield loss.

**Shared behavior that must survive:** weapon eligibility/arc/fire control/LOS in `strategic-combat-weapons.ts` and `combat-weapon-geometry.ts`; damage in `strategic-combat-damage.ts`; mine constraints in `strategic-combat-mines.ts`; tractor pulses and asteroid throws; ship/asteroid collisions; grapple and boarding; escape and win evaluation. Existing `combat-exchange-collision.ts` also changes velocities for collision impulses; one flight authority does **not** mean deleting legitimate physical impulses.

## Architecture direction — boundaries, not new features
- Strategy owns durable fight/flee/boarding intentions and never issues engine commands.
- Tactics owns a maneuver's purpose, applicability, commitment, success/failure/interrupt reason; no mandatory variety, no scripted partner response.
- Navigation produces a single authoritative movement intent per ship and tick; existing propulsion physics executes that intent. Avoidance imposes safety constraints, not a competing combat plan.
- Weapon and special-system runtime stays canonical; firing rules do not independently force stationary positions.
- A single path serves regular fights and the reference duel.
- Telemetry is read-only and records reasons, physical movement and actual outcomes; a stagnation observer is never a second pilot.

Whether both ship tactics remain entirely independent or use limited shared coordination is **not decided** by the external architecture PDF. Its proposed new accelerations, masses, flight-controller file layout and 12 layers are **not requirements**.

## Existing tests with implementation coupling
- `combat-exchange-machine.test.cjs` requires exactly three reactions per action and forces action variety in a deterministic loop, regardless of situation.
- `combat-exchange-braking.test.cjs` requires waypoint slowing; passing this does not prove cinematic combat.
- `combat-exchange-safety.test.cjs` constrains the existing lane convention.
- `combat-combined-long-duel-seeds.test.cjs` verifies 48-second **unarmed** numerical replays, not combat quality.
- `combat-tactical-diversity.test.cjs` checks a 24-second damage-stagnation fallback and numerical stability.
- `docs/COMBAT_TEST_MATRIX.md` itself warns that green tests do not establish complete path or balance coverage.

Before replacing tests classify them as **gameplay invariant**, **legacy implementation requirement**, or **quality metric**. Keep physical, equipment, damage and campaign regressions.

## Phase 1 measurements
Use read-only motion collection plus existing seeded simulation. Metrics to capture: seconds at very low speed, longest joint slow streak, little relative motion, stable separation windows, close-pass candidates, phase/action change counts, outcome, damage and validity. These indicators do not automatically define cinematic quality. Compare identical seeds **and** visible battle recordings.

```bash
node tests/combat/combat-motion-metrics.test.cjs
node scripts/combat-motion-baseline.cjs 90 > combat-motion-before.json
npm run check:quick
```

**Baseline numeric results are pending.** This environment can read/write GitHub sources but cannot clone the private repo for a full dependency-graph execution. Do not claim that repository tests passed or invent scores.

## Gate before runtime refactor
1. Run baseline, existing test suite and visually inspect sample fights; preserve results.
2. Finish the exhaustive inventory of movement-state writers, including grapple, collision, tractor and campaign inputs.
3. Record scenario expectations: identical patrols; front/broadside; fast/slow; mines; tractor; flee; engine loss; obstacles; grappling.
4. Specify the exact single control path and success/failure semantics before changing any combat behavior.
5. Retain original features and compare matched seeds, edge cases and visible action; merge only after user approval.

## Physical motion writers verified separately

Not all velocity changes are competing AI commands. Preserve physically justified impulses and constraints while consolidating **AI flight intent**:

- `combat-inertial-thrust.ts`: normal flight velocity/position integration.
- `combat-exchange-pilot.ts`: exchange-only heading/thrust/motion pilot; overlaps with the regular pilot path.
- `strategic-combat-movement.ts`: regular heading/pilot and ship-collision boundary.
- `combat-exchange-collision.ts`: physical separation impulses and ram damage.
- `combat-asteroid-contacts.ts`: penetration correction and collision impulses.
- `combat-grapple-physics.ts`: rope corrections and tether impulses.
- `combat-tractor-pulse.ts`: physical tractor impulse on opponent velocity.
- `combat-tractor-asteroid-throw.ts`: independent thrown-rock integration.
- `strategic-combat-service.ts`: coupling velocity adjustment during docking.

**Do not interpret the PDF's “one writer” as forbidding collision, tractor or grapple impulses.** The enforceable goal is one normal AI propulsion path, with explicit physical effects remaining authoritative. A naive replacement that eliminates these writers would break existing gameplay.
