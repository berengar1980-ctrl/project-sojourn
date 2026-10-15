# Combat flight ownership

PR #231 replaces competing movement instructions with an explicit velocity/heading contract.

## Decision chain

| Layer        | Authority                                                                           | Must not do                                                                              |
| ------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Commitment   | Player order or `reviewCombatCommitment`: fight/flee                                | Cancel an operational escape because a probability or timeout changed                    |
| Strategy     | `reviewCombatStrategy`: weapon group, side and desired range                        | Reset the execution phase when renewing the same doctrine                                |
| Flight order | `createCombatFlightOrder`: desired world velocity and independent bow bearing       | Turn braking into a new attack/retreat heading                                           |
| Navigation   | Route the selected translation or exit; correct hazards                             | Route a retreat to the opponent or let gun alignment override a blocked corridor         |
| Actuation    | `pilotCombatFlight`: bounded turn, main/reverse/lateral impulse, drift, integration | Choose tactics, rotate existing momentum instantly or accelerate with a destroyed engine |
| Weapons      | Existing range, hardpoint arc, line-of-sight, cooldown and fire-control checks      | Suppress all hull shots merely because the preferred subsystem is not exposed            |
| Presentation | Show the accepted order immediately                                                 | Hide state churn behind a minimum display time                                           |

The Alpha exchange scheduler remains a distinct maneuver planner (action/reaction and outcome evaluation). Its destination adapter uses the same physical pilot as campaign combat. It tracks the current target and actual port/starboard mounting instead of a stale maneuver angle. Choose/resolve frames also advance physical movement. The normal planner and exchange scheduler remain mutually exclusive; they do not both command a ship in one tick. Grapple constraints and collision impulses remain external physical forces.

## Removed conflicts

- Deleted the separate inertial-thrust implementation and obsolete range-posture controller.
- Removed the unused tactic mutator and the normal movement chain that overwrote range control with pursuit, braking, and orbit headings.
- Relative-velocity control handles range acquisition and braking without taking the bow away from its weapon bearing.
- Removed the 1.2-second phase hold, 2-second HUD hold and 24-second stalled-plan penalty. Geometric range/alignment hysteresis remains: it represents distinct entry/exit conditions, not a waiting period.
- Retained strategic scoring cadence. Renewing an equivalent plan preserves its phase. Escape has its own execution phase.
- Route caches are invalidated when the navigation destination changes materially; explicit tactic changes clear them immediately.
- Preserved empty equipment slots during runtime filtering so mounted weapons retain their hardpoint identity.

## State boundary

Flight commands are computed values, not persistent equipment or progression. The route destination cache is transient navigation state owned by the combat runtime. It is deliberately absent from progression snapshots. Public combat snapshots continue to detach positions, velocities and strategies. No save/load or migration behavior is introduced.

## Verification

`tests/combat/combat-flight-simulation.test.cjs` runs thirteen complete 60-second fixtures: patrol, freighter, miner and salvager movement profiles, forward guns, port and starboard guns, turrets, fight/kite/flee, ordinary and Alpha exchange control, obstacles, and 40/80 ms simulation steps. Durable hull/shield fixtures prevent premature victory; they are test-only, not balance changes. Assertions inspect actual travel, fire-control shot timestamps, prolonged inactivity, execution-phase changes and escape progress. Existing combat tests cover mines, grapples, tractor interactions, collisions and normal damage/finishing behavior.

`combat-flight-ownership.test.cjs` checks phase preservation on strategy renewal, range-boundary hysteresis, independent braking/alignment, acceleration limits, disabled-engine drift and immediate route-goal invalidation.

The full regression gate also covers campaign, PvP, mining, salvage and equipment transactions. Several pre-existing assertions depended on source formatting, old display delays or superseded behavior. Those contracts were corrected after reproducing failures on the original PR head. Formatting/lint/module-size cleanups preserve procedural random-call order and mesh geometry.
