# SOJOURN Architecture Rules

SOJOURN is a strict TypeScript ES-module project built with Vite. The rules below are executable through `npm run check`.

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

## TypeScript rules

The compiler runs in strict mode with additional guards including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports`.

Do not use `any` as an escape hatch. Prefer explicit domain types, discriminated unions, readonly data where practical, and narrow public interfaces.

## Enforced quality gates

- Prettier.
- ESLint with zero warnings.
- TypeScript strict type checking.
- Vite production build.
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

Before merging any change under `src/`, `tests/` or `resources/`, review and update `docs/VOIDBOUND_FEATURE_PARITY.md`. If parity does not change, record `keine Statusänderung` in its Review-Log. The normal test gate enforces that the parity document is touched on feature-bearing branches.

Do not add version-named patch files, hotfix chains, monkey-patching, function replacement layers, or load-order fixes. If a canonical module becomes too large, split responsibilities before weakening a gate.
