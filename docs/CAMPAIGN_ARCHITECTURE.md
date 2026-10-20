# SOJOURN – Campaign architecture

## Scope and status

The first implementation slice establishes the **typed event bus**, independent
campaign package registry/state machines, detached **campaign-state snapshots**,
and navigation/combat/boarding event bridges. It does **not** yet claim complete
career save/load, dynamic worlds, or finished story/dialogue UI.

The character editor's existing PlayerProfile remains the only character creation
source: captain name, portrait, ship name, ranged/melee skills, seven station skills,
and selected station ID are forwarded in the game-initialized event.

## Dependency direction

- Game services produce typed domain events; campaign packages consume them.
- Campaign packages are registered in CampaignRuntime. Unknown save entries remain
  in snapshots, unavailable but preserved until packages return.
- CampaignRuntime owns package-local progress. No package receives mutable game state.
- CampaignEventBus queues nested emissions and isolates listener failures.
- The central Action Gateway for validated economy/crew/world mutations is a
  subsequent phase, not something packages should bypass.

## Event contracts already bridged

- game.initialized: game controller construction, after validated player profile
- travel.started: first travel frame (UI-initiated travel included)
- location.arrived: navigation reaches a destination, without duplicates per frame
- combat.ended: non-boarding combat results
- boarding.ended: completed boarding encounter

Further ports will add game-wide time, cargo changes, crew recruitment, mining,
salvage, sensor contact, ship equipment and reputation events at their system
boundaries, with typed payloads and idempotency keys.

## Save contract

CampaignSnapshot.snapshotVersion = 1. Its enabled selection and per-package status,
version, outcome and JSON-only data are snapshot-safe. A new in-memory instance may restore
this data, migrate a package version using its registered migration, or mark
a package unavailable without deleting saved progress. **Do not store this snapshot
alone as a career save:** the rest of the game state would diverge. Embed it
atomically with navigation, economy, cargo, crew and ship snapshots when the
full-game persistence service is implemented.

## Next slices

1. Define authoritative full-career snapshot adapters and persistence migrations
   for navigation, crew, loadouts, economy, NPCs and combat continuity.
2. Add campaign action ports (cargo/credits/crew/ship/combat) with validation and
   exactly-once effect identifiers.
3. Replace direct narrowsSector accesses with world registry read interfaces;
   add campaign-scoped places and temporary sectors.
4. Add UI for dialogue choices, quest log, campaign manager and results.
5. Verify functional parity with all six Voidbound campaign packages, replacing
   its global state/UI hooks with typed services.

## Quality gates

Run npm run check (including TypeScript, formatting, lint, dependency and
regression tests) and tests/campaign/campaign-foundation.test.cjs before merge.
The source-of-truth Voidbound repo remains read-only.
