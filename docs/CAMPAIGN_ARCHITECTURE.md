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

## Phase 4 – runtime mission locations and temporary star systems

`CampaignWorldService` owns campaign-scoped mission locations and detached,
JSON-compatible **observational** snapshots. The regular Narrows world definition
is never modified. A runtime composition exposes the current world's markers
through the existing star-map model and the normal NavigationService. Actions:

- `world.location.add`: add a uniquely identified mission-only marker to
  Narrows; no unimplemented trade, dock, mining or salvage service is advertised.
- `world.system.add`: register a finite, validated mission-only WorldMap with
  its own star, locations, regions, entry and exit IDs.
- `world.system.enter`: switch the authoritative navigation context to a
  registered foreign system while not travelling.
- `world.system.return`: return only from the registered exit gate. The map's
  exit is also usable by selecting the current exit marker on the star map.

Each successful action uses the existing campaign receipt. When a package is
disabled, completed or unloaded, its markers and systems disappear; a ship in
that package's world returns safely to the original system. Removing a
selected mission destination clears the target and cancels a flight to a
removed destination; otherwise existing travel continues.

A foreign system suppresses Narrows' economy scanner, salvage events, sector
NPCs and local hostile engagements in its map view. It does not yet offer an
independent market, NPC simulation, planetary landing, fleet spawning or
mission-specific local-space/mining scene. This is a **runtime map scope**
rather than a second full sector simulation or a persistent savegame.

## Phase 5 – quest presentation and first playable campaign

Campaign packages may implement the **pure** `present(progress, currentLocationId)`
projection to show a chapter, current objective, optional map target and
location-gated dialogue choices. The CampaignRuntime's `journal(locationId)`
reads that projection from a detached campaign progress record and returns
detached journal entries. Choice controls are rendered in the existing
star-map **Aufträge** drawer; a chosen response becomes a validated
`dialogue.choice` event routed through the campaign event bus. The UI does
not own progression, currency or location state.

The first package `src/data/campaigns/silent-signal.ts`, registered in the
manifest, implements **Das verstummte Signal**:

1. Decode a signal near Haven to register a temporary foreign system
2. Travel to the research ship Elara and decide between evacuation and quarantine
3. Return through the exit gate, deliver the report, collect credits and faction
   reputation, and complete/clean up all temporary mission worlds

Both endings are tested with the authoritative navigation, world service and
campaign runtime. Game snapshots remain **observational in-memory snapshots**
and there is deliberately no save/load UI. The foreign system does not yet
simulate independent markets, pirates or crew boarding.

## Campaign selection in the main menu

The main-menu **Kampagnen** action shows every registered package from
`src/data/campaigns/manifest.ts` in a scrollable list: title, version,
category, optional description and the current checkbox selection.
New packages appear automatically in this UI as soon as their definitions
are registered in that manifest (there is no browser filesystem traversal).
The separate **Kampagnenspiel** action and the selector's **Neues Spiel**
button both proceed through the existing character editor.

`CampaignSelection` owns the in-memory selection for the present application
session and returns detached, JSON-compatible `snapshot()` values.
The selection is passed through the game controller setup and applied to the
`CampaignRuntime` **after registration and before `game.initialized`**.
Unknown identifiers are ignored by the game runtime and cannot be toggled in
the selector. `core` packages remain mandatory; they are visible but their
checkboxes are locked. Optional and development packages can be switched on
or off. Selection changes affect only **new** games, not an active runtime.

`Das verstummte Signal` is a `development` reference campaign with
`defaultEnabled: false`. It is not launched by default, but can be selected
for integration testing. No selection is written to persistent storage;
restarting the application resets to package defaults because full-game
save/persistence is not implemented. This behavior is covered by runtime
and UI interaction tests.
