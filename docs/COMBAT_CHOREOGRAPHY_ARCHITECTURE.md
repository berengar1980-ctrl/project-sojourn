# Combat choreography: ownership and non-regression contract

This document describes the **existing** action/reaction combat system. It does not
authorize replacing it with a new maneuver planner.

## Responsibilities

1. `combat-commitment.ts`: strategic fight/flee decision; an escape order remains binding.
2. `combat-exchange-machine.ts`: action/reaction choice, initiative and exchange lifecycle.
3. `combat-exchange-pilot.ts` / `planExchangeFlight`: create committed flight lanes for
   frontal, broadside, disengage and flanking passages, with opponent reactions.
4. `combat-exchange-goals.ts`: **single owner of flight-order priority**:
   escape exit > critical safety reaction > committed choreography goal.
5. `combat-asteroid-routing.ts`: local hazard routing without replacing the order.
6. `pilotExchangeShip`: actual turn rate, thrust, inertia, RCS and boost.
7. Weapon and damage systems: independently evaluate real range, firing arcs and impacts.

## Invariants

- A non-critical pursuit or tractor event never replaces the current passage.
- Critical safety corrections are temporary. The original immutable plan resumes.
- One ship's reaction does not change the other ship's flight order.
- Escaping ships use the arena exit and are not sent to an exchange waypoint.
- The four action types must produce distinct trajectories with real displacement.
- A green unit-test suite is **not** evidence of satisfying gameplay quality.
  Manually check that fights remain animated, varied and physically plausible.

## Verification

Run `npm run check:quick` and `npm run build`. Review the tests under
`tests/combat/combat-exchange-*.test.cjs`, particularly
`combat-exchange-goal-priority.test.cjs` and
`combat-exchange-choreography-regression.test.cjs`.

Before merging to main, play the same representative fights on base main and
on the branch: forward guns vs forward guns, broadside vs frontal, mines,
collisions near an asteroid, and a fleeing civilian. Check time in motion,
shots fired, passage completion, actual weapon facing and escape progress.
Do not merge when gameplay visibly regresses even if CI is green.
