# Combat flight ownership

PR #231 uses one combat AI for campaign and every PvP preset. Seeds control reproducible randomness, never select an AI architecture. The Alpha action/reaction scheduler, forced alternating roles and duplicate maneuver controllers have been removed.

## Decision chain

| Layer        | Authority                                | Contract                                                                                                                                           |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commitment   | Player order or `reviewCombatCommitment` | Own fight/flee; an operational escape cannot be cancelled by fluctuating odds.                                                                     |
| Strategy     | `reviewCombatStrategy`                   | Select equipped weapon group, actual mounting side and range; preserve equivalent plans within a score margin. Do not rewrite the player's tactic. |
| Maneuver     | `updateCombatManeuver`                   | Own intercept, hold, pass, extend and escape, including their completion and abort conditions.                                                     |
| Flight order | `createCombatFlightOrder`                | Express desired world velocity independently from bow bearing for the selected weapon group.                                                       |
| Navigation   | Shared hazard routing                    | Correct translation for obstacles, mines, collisions and field boundaries without inventing another strategic objective.                           |
| Actuation    | `pilotCombatFlight`                      | Apply bounded rotation, main/reverse/lateral thrust, drift and integration.                                                                        |
| Weapons      | Existing fire control                    | Fire when actual range, mounted arc, line of sight and cooldown permit; a preferred subsystem must not suppress valid hull shots.                  |
| Presentation | Maneuver plus accepted flight constraint | Show the actual objective and safety correction without artificial display delays.                                                                 |

Both ships decide and fly against the same beginning-of-frame observed opponent motion. Updating the attacker first must not give the defender a different physical observation. Grapple constraints and collision impulses remain external physical forces.

## Commitment and progress

Interception corrects its course as the target moves, without starting a new maneuver. Reaching the firing envelope completes interception. Front weapons may productively hold a firing position; a stationary ship that fires is not a stalled ship. Broadside passages and range-extension maneuvers commit to a world-space destination. They finish on arrival, or abort when the target actually leaves the engagement envelope. Weapon-plan changes and explicit flee orders can interrupt immediately.

Range and aiming hysteresis distinguish entry from exit conditions. There is no periodic random maneuver timer, role alternation or initial planning delay. A progress watchdog measures distance, useful aiming progress and actual shot timestamps. Its allowance accounts for turning, braking and weapon reload. A genuine stall requests a new spatial approach, rather than repeatedly restarting the same turn. Escape stays committed. Disabled engines do not trigger futile maneuver churn.

Passing uses the same local convention for both ships, yielding opposite world-space lanes. Destinations remain inside navigable field bounds. If clipping an outward course would produce a negligible destination, a reachable lateral passage is selected once. Cover is selected by the maneuver director, not continuously overwritten by the movement layer.

Weapon posture comes from the selected group: a spare side gun cannot rotate a frontal plan sideways. Status labels name the maneuver and selected front/broadside posture. Flight snapshots expose the final heading, velocity and navigation constraint. Maneuver transitions include a serial and reason in telemetry.

## State boundary

Maneuvers, navigation routes and accepted flight commands are transient encounter state owned by the combat runtime. Public snapshots detach maneuver goals and flight velocities. They are not equipment, progression or a save schema. Boarding availability is an explicit arena option; PvP disables it independently of seed.

## Verification

- `combat-flight-simulation.test.cjs`: thirteen 60-second cases across patrol, freighter, miner and salvager movement profiles, gun mountings, fight/kite/flee, obstacles and 40/80 ms steps.
- `combat-preset-simulation.test.cjs`: all nine actual duel presets for 60 seconds, using real mounted weapons, crew values and scattered rocks.
- `combat-maneuver-simulation.test.cjs`: seven 120-second cases, including symmetric front, port and starboard duels, mixed armament and obstacles. Three seeds verify that seed selection does not change the flight architecture.
- Durable hulls and shields keep these simulations running for the full interval; production balance is unchanged. Assertions measure travel, shot timestamps, quiet periods, maneuver changes, recovery counts and escape progress.
- Lifecycle tests cover opponent status oscillation, fixed destinations, geometric completion, range hysteresis, stalled-progress recovery, all four corners, immediate flee and detached diagnostics. Actuation tests cover real braking, RCS demand, moving-target lead, bounded turning and boost ramp-up.
- Existing regressions cover campaign, PvP, mining, salvage, equipment transactions, mines, tractor/grapple interactions, collisions and real damage outcomes. Obsolete exchange-role tests are replaced by shared-controller behavioral coverage.

Run `npm run check:quick` and `npm run build`. `npm run combat:simulate` reports maneuver starts and progress recoveries instead of counters for the deleted exchange scheduler.
