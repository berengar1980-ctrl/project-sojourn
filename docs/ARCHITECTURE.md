# SOJOURN Architecture Rules

SOJOURN is an ES-module project. The rules below are executable through `npm run check`.

## Layers

- `src/core/`: generic primitives and state foundations; only core/data dependencies.
- `src/data/`: declarative game data; only core/data dependencies.
- `src/systems/`: gameplay/domain logic; never imports UI.
- `src/features/`: orchestration across systems.
- `src/ui/`: rendering and input adapters.
- `src/app/`: composition root/bootstrap; wires the application together.

Dependencies point inward/downward. Circular imports are forbidden.

## State ownership

No mutable state is exported through `window`, `globalThis`, or ad-hoc shared globals.
A subsystem that owns state also owns its mutations. Other modules use explicit APIs.

## Renderer boundary

Rendering never owns gameplay rules. Map, UI and effects consume snapshots/view models and invoke explicit domain commands. Route planning, travel, encounters and persistence remain independent of Canvas/DOM code.

## Enforced quality gates

- Prettier.
- ESLint with zero warnings.
- ES modules for all runtime code.
- no `eval`, `new Function`, `document.write`.
- no writable global exports.
- max 500 lines per runtime module.
- max 100 lines per function.
- cyclomatic complexity <= 20.
- max nesting depth 4.
- import-cycle detection.
- architecture-layer direction checks.
- a single module entry point in `index.html`.
- lowercase/kebab-case runtime filenames.

## Change policy

Add behavior to its canonical owner. Expose narrow APIs. Keep presentation passive. Add regression tests. Run `npm run check`.

Do not add version-named patch files, hotfix chains, monkey-patching, function replacement layers, or load-order fixes. If a canonical module becomes too large, split responsibilities before weakening a gate.
