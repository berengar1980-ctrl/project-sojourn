# Combat AI refactor — target responsibilities

## Outcome, not scripted choreography

Combat is an emergent two-ship simulation. Neither ship receives a prescribed partner reaction or a fixed sequence of passes, evasion, pursuit and counterattack. Both sides may assess the same situation independently, under the same existing physics and weapon rules.

A maneuver can have phases and conditions, but a phase is **not** a timeline for an animation. Success is determined by what the ship actually accomplished. Failure and interruption must have explicit reasons. Repetition is allowed if it remains tactically justified, not artificially prohibited to create spectacle.

Cinematic quality is a measurable and visually reviewed outcome, not a command to increase speed at all times.

## State and decision ownership

- **Fight, flee, boarding commitment:** strategic decision; a player command cannot be overridden by weapon aiming or navigation.
- **Tactical maneuver choice:** one decision process per ship; reads the real combat geometry, equipment, constraints and outcomes.
- **Flight intent:** active maneuver; desired travel/facing directions with observable progress and outcome.
- **Navigation and safety:** one movement adapter per ship; avoids mines, asteroids and collisions without selecting a different tactic.
- **Propulsion:** existing flight integration; acceleration, turn rate, RCS, boost and inertia remain unchanged.
- **Physical impacts:** existing collision, tractor and grapple handlers; legitimate impulses remain authoritative.
- **Weapons and special systems:** existing combat runtime; preserves eligibility, timing, arcs, shields and subsystem rules.
- **Telemetry:** read-only observer, never a source of commands.

This is an **ownership specification**, not a requirement to introduce one new module for each table row. Keep code in canonical owners and remove superseded paths after parity and behavior are proven.

## Unified frame flow

1. Read current ship and arena state.
2. Apply durable fight/flee/boarding decision and independent tactical maneuver selection when due or interrupted.
3. Calculate each ship's current movement intent from its active maneuver and latest physical state.
4. Resolve navigation/safety constraints without replacing the chosen tactic.
5. Execute the intent through the existing legal propulsion rules, then resolve physical collision and special-system impulses.
6. Apply the existing weapons, shields, damage, mines, tractor, grapples and outcomes.
7. Record actual maneuver progress, success/failure, motion and relevant events.

The reference duel seed **must not** select a separate AI steering implementation. Seed remains available for reproducibility only.

## Non-negotiable behavior contracts

- No forced `Action A -> Reaction B` choice table and no alternating initiator imposed for visual variety.
- No fixed 10/14-second expiration as the only signal a pass was completed.
- No permanent 'arrive at opponent and stop' objective unless an explicitly justified current operation requires low relative speed.
- No separate weapon-facing, tactical, asteroid-cover or pursuit module may independently replace the final movement order.
- No new acceleration modes, masses, ship components, weapons or balance modifications as part of this refactor.
- Do not delete the genuine physical impulses in collision, tractor, grapple, asteroid or ramming logic.
- No random flight oscillation or teleport as a fallback for stalled combat.
- No artificial extension of battles to show additional maneuvers.
- Normal gameplay, campaign, reference duel and boarding must share the canonical combat movement and damage behavior.

## Implementation boundaries

**First: confirm why current fights stall.** Baseline is in `docs/combat-baselines/main-pre-refactor-2026-10-15.json`. An optional timeline probe is available via:

```bash
node scripts/combat-motion-baseline.cjs 90 --trace > combat-stagnation-trace.json
```

Inspect time of first sustained both-slow period, simultaneous tactic/phase, desired range, actual separation and dwell near the existing 86-meter collision resolution distance. The trace is observational; near-contact is correlation, not proof of cause.

**Next: commit one real maneuver in a unified path.** Start with a weapon-appropriate approach/pass and maintain old propulsion and weapons unchanged. An action is finished only when a measurable geometric goal was reached or became invalid. Run the same seeded scenarios on both versions; preserve existing invariant tests even if the choreography-specific tests must be retired.

**Then: expand only the existing tactical capabilities needed for parity.** Flank, broadside, pursuit, retreat, mines, tractor, asteroids and grapple integration must use the common path, not side branches that seize control.

**Final acceptance:** deterministic scenarios, complete unit/integration gates, no persistent unintended idle/close-range lockups, no plan flicker, no illegal equipment use, preserved damage semantics and human review of sustained dynamic fights. No merge to `main` without explicit permission.

## Known unanswered questions

- Is the sustained 86-meter proximity driven by recurring physical contacts, braking toward preferred distance, or both?
- Which strategy/phase pairs and weapons are active at the first slowdown?
- Does a short-range, low-relative-speed stand-off ever have legitimate tactical value for specific current weapon loadouts?
- How much of the reference path's mobility can arise naturally without its preselected partner reactions?
- How can the first shared maneuver be introduced without changing seeded gameplay, grapple and campaign initialization?

Do not guess these answers or claim the target behavior is implemented merely because the ownership model is documented.
