# Ship state boundaries (development phase)

The project does **not** yet support saving or loading games. Old development saves are not supported and require no migration logic.

## Current owners of mutable state

- `ControllerRuntimeState.playerProfile`: immutable captain/ship identity, combat and station skills, and selected starting station created before a campaign; exposed via detached `GameController.profileSnapshot()`. A transient in-memory owner, not a savegame format. The starting ship definition is copied with the chosen name, never mutated globally.
- `CrewRosterService`: canonical captain crew member with ID `player`, live station assignment and skill progression. The selected initial station is applied in the existing roster's assignment records. Detached member and assignment snapshots prevent UI from mutating roster state.
- `ControllerRuntimeState.activeShip`: currently active hull; `ShipOwnershipService` exclusively owns purchased hull IDs, validates canonical one-time purchases and debits the authoritative `PlayerTradeService` exactly once. It provides a detached `snapshot()`. The unrestricted **test ship switcher** remains separate from ownership checks.
- At a real shipyard, activation preflight checks cargo **including loose-component reservations**, miner cargo compatibility, and crew berths before swapping. A purchased hull remains owned even when it cannot be activated yet. Existing hull loadouts are keyed by stable hull ID; on first activation, the crew roster carries over compatible station assignments and preserves previously configured assignments when returning to another hull.
- `ShipOperatingService`: single in-memory owner of each hull's remaining fuel and unrepaired hull damage. It consumes distance-based fuel, debits the same player wallet for automatic port refueling and manually requested repairs, and exposes detached `snapshotAll()` records (fuel and damage keyed by hull ID), plus derived current/max values via `snapshot(ship, hullMaxHp)`. No UI or navigation view may directly mutate the tank or repair state. New purchased hulls start with their role-defined full tank and intact hull; the developer test switcher remains unrestricted.
- `NpcSectorService`: existing `SectorNpcState` owns NPC tank, hull, and credit balances. The shared NPC port service deducts actual credits for fuel and repairs instead of generating free refills. Patrol missions earn bounded operating subsidies on completed runs; non-contract pirates do not.
- `ShipLoadoutService`: installed component IDs per hull ID. A component ID includes its Mk tier and any single recovered modifier.
- `ShipComponentInventoryService`: loose component IDs, provenance, cargo reservation, and the next identifier counter.
- `ShipyardResearchService`: maximum discovered percentage per exact component model and modifier kind. NPC and player vendors use the same research instance.
- `CampaignRuntime`: independent, in-memory package progress, activation selection and completion outcomes. Its detached `snapshot()` includes per-package JSON data without exposing mutable references; unknown packages remain unavailable without data loss. This is not a complete career save format.
- `PlayerTradeService`: canonical player credit balance, cargo lots, weighted cost basis and exact campaign grants/removals. The new detached `snapshot()` exposes current balances and cargo without allowing edits to the owner; it is not a save format.
- `CampaignRuntime`: also owns per-package successful action receipt IDs; an already applied ID is inert. These receipts and the underlying gameplay state must eventually be restored atomically, never separately.

None of these objects should be stored in the view layer.

## Snapshot boundary

`createShipProgressionSnapshot` collects detached JSON-compatible representations of these states. Individual services expose `snapshot()` methods, without exposing their internal maps or arrays.

This is an **in-memory data contract**, not an on-disk format. It does not promise restoration, backwards compatibility, or a stable serialization schema. Future save support should add explicit validation, format versions, NPC/economy/crew snapshots, load-order rules, and migration policy **only when the core gameplay has stabilized**.

## Design constraints

1. Keep stable IDs for hulls, inventory entries, component definitions, and discovered bonus keys.
2. Mutate state only through the owning domain service or controller, not HTML elements.
3. Keep snapshots detached from mutable references; they are observations, not transactions.
4. Never infer a component's properties from visible labels; use canonical component IDs.
5. No `localStorage`, IndexedDB, filesystem saves, load buttons, or compatibility shims at this stage.

- `CampaignWorldService` owns temporary mission locations and foreign-world
  definitions. `snapshot()` detaches nested world geometry; the authoritative
  NavigationService owns position, routes and arrival state. Neither snapshot
  is a durable game save. Closing or disabling a campaign removes its overlays
  and safely returns ships stranded in a campaign-owned system.


- `FuelJourneyService`: in-session owner of the player's accepted destination and remaining fuel-route legs. Its `snapshot()` returns detached station-ID arrays, and it clears the journey on new route selection or after the final arrival. Fuel and credits remain exclusively owned by `ShipOperatingService` and `PlayerTradeService`; the itinerary is never used as a second tank or wallet state.
