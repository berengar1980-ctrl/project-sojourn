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
- A Campaign Action Gateway now provides validated exact-value credits and cargo
  transactions, crew hire/dismiss and station assignments via their canonical
  services. Campaigns cannot access mutable domain state through this API.
- Packages call `CampaignContext.applyAction(actionId, action)`. Successful
  action receipts are recorded by campaign and returned as `already_applied` on
  repeat calls. Invalid or failed actions stay retryable.
- This phase deliberately does not yet enable equipment transfers, forced
  combats, reputation changes, dynamic worlds or arbitrary state mutations.

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
version, outcome, JSON-only data and applied-action receipts are snapshot-safe. A new in-memory instance may restore
this data, migrate a package version using its registered migration, or mark
a package unavailable without deleting saved progress. **Do not store this snapshot
alone as a career save:** the rest of the game state would diverge. Embed it
atomically with navigation, economy, cargo, crew and ship snapshots when the
full-game persistence service is implemented.

## Next slices

1. Define authoritative full-career snapshot adapters and persistence migrations
   for navigation, crew, loadouts, economy, NPCs and combat continuity.
2. Extend the campaign action ports to ship equipment, reputation, and mission
   combat once their domain services can guarantee exact all-or-nothing effects.
3. Replace direct narrowsSector accesses with world registry read interfaces;
   add campaign-scoped places and temporary sectors.
4. Add UI for dialogue choices, quest log, campaign manager and results.
5. Verify functional parity with all six Voidbound campaign packages, replacing
   its global state/UI hooks with typed services.

## Quality gates

Run npm run check (including TypeScript, formatting, lint, dependency and
regression tests) and tests/campaign/campaign-foundation.test.cjs before merge.
The source-of-truth Voidbound repo remains read-only.

## Action gateway safety

- Campaign actions carry explicit, per-campaign receipt IDs. Replaying the same
  successfully applied action cannot reissue a reward in the same game runtime.
- Credits and cargo use new exact domain-service transactions: insufficient
  funds, absent stock, an invalid resource, a full hold, or an unsafe number
  rejects the action without a partial change.
- Crew operations reuse the canonical roster and ship station policies.
- Every campaign state snapshot is detached from the mutable action receipt list.
- This is an **in-memory** guarantee, not a durable savegame transaction. Saving
  and restoring both the gameplay state and its action receipts atomically is
  required before introducing actual save/load.
- There is no multi-operation batch with rollback yet; campaign authors use
  separately validated actions and explicit outcomes until that exists.

## Phase 3 – faction reputation, ship equipment and live NPC combat

The Action Gateway additionally supports:

- `reputation.change`: signed integer change for a registered faction,
  accepted only if the resulting value remains within -100..100. The
  `FactionReputationService` is the authority and exposes detached snapshots.
- `component.grant`: a catalog-validated loose ship component is inserted into
  the existing components inventory with normal cargo-capacity reservation and
  an explicit campaign provenance.
- `component.install`: installs a component from the player's loose inventory
  into a **vacant, fitting slot only**. The normal hardpoint/tier checks run;
  only then is the loose component consumed and its reserved cargo released.
  Existing equipped modules are never silently destroyed.
- `combat.start`: uses `StarMapEngagementService.engageNpcNow` for a **live,
  existing NPC only**, from the star map, within 650 world units, while not
  travelling, pursuing, or already fighting. The normal controller presents
  the battle on its next tick. No alternative combat rules or enemy spawns.

The faction manifest contains stable directorate, free-trader, and corsair
IDs. This phase introduces storage and action semantics; it does not yet
connect faction scores to trade pricing, patrol responses, or UI. It does
not spawn new NPC opponents, transfer installed equipment between ships, or
provide cross-service atomic batches. The snapshot and exactly-once receipts
remain in-memory until career-wide persistence is implemented.
