# SOJOURN Testing

- `npm run dev`: local Vite development server.
- `npm run build`: strict typecheck plus production build.
- `npm run typecheck`: TypeScript compiler gate without output.
- `npm test` / `npm run test:quick`: normal development tests.
- `npm run test:full`: also includes `tests/full/`.
- `npm run lint`: ESLint with zero warnings.
- `npm run format:check`: formatting gate.
- `npm run deps:check`: cycles and layer rules.
- `npm run deps:report`: writes `docs/generated/dependency-graph.json`.
- `npm run check`: complete quality gate including production build.

Tests use semantic names and domain folders. Do not use historical version numbers in test names. Slow simulations belong under `tests/full/`.
