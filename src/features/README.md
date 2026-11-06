# Features

Domain logic and UI grouped by feature. Each feature has `shared.ts` (browser-safe types), `components/` and
`server/` (`service.ts`, `queries.ts`, `commands.ts`, `tools.ts`). Register new features in
`shared/server/registry.ts`. Guide: [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).
