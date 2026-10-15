# Ship state boundaries (development phase)

The project does **not** yet support saving or loading games. Old development saves are not supported and require no migration logic.

## Current owners of mutable state

- `ControllerRuntimeState.activeShip` and `ownedShipIds`: currently active hull and purchased hull IDs. The unrestricted **test ship switcher** remains separate from ownership checks.
- `ShipLoadoutService`: installed component IDs per hull ID. A component ID includes its Mk tier and any single recovered modifier.
- `ShipComponentInventoryService`: loose component IDs, provenance, cargo reservation, and the next identifier counter.
- `ShipyardResearchService`: maximum discovered percentage per exact component model and modifier kind. NPC and player vendors use the same research instance.

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

## Transient combat state

The strategic combat runtime owns maneuver commitment (including fixed goals, progress observations and transition reasons), navigation routes and accepted flight commands. Both ships consume a common beginning-of-frame observation. `getSnapshot()` detaches maneuver goals and flight velocity objects; no mutable references escape. This encounter-only state is deliberately absent from progression snapshots and introduces no persistence. See `COMBAT_FLIGHT_ARCHITECTURE.md`.
