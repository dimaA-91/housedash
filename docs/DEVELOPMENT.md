# Development

## Local setup

```powershell
npm ci
pwsh scripts/Start-HouseDashDev.ps1     # http://127.0.0.1:3000/family
```

The dev server uses `./data` in the project folder (ignored by Git). It never touches the Pi.
Host services (phone, updater, Wi-Fi, voice) are not available locally; their pages say so.

## Checks

```powershell
npx tsc --noEmit
npm run lint
npx next build
node scripts/analyze-housedash-deps.mjs   # files reachable from the app's entry points
```

The project has no automated test suite. Verify changes in the browser (wall display 1536×960,
tablet 1024×768, phone 390×844) and, for host services, on a real Pi.

## Conventions

- UI text is German; docs and commit messages are English. New code comments in English; many existing comments
  are still German.
- One domain implementation per feature in `src/features/<name>`. HTTP routes and the voice assistant call it;
  neither re-implements rules. No feature logic in `voice/broker.py`.
- Every write goes through a store and `withDataTransaction`. No direct JSON writers, no second database,
  never a second app replica.
- New data formats: add a schema version and migration in `housedash-schema.ts`, a backup section in
  `backup-sections.ts`, and member references if people are named. Never reset unknown newer data.
- Times for the assistant are local time of the home (`settings.timezone`).
- Keep the 14″ wall display first: fixed 1536×960 stage, touch targets of at least 48 px, no layout jumps
  when the on-screen keyboard opens.

## Adding a feature

1. Create `src/features/<name>` with `shared.ts`, `components/` and `server/service.ts`.
2. Put reads in `queries.ts` and writes in `commands.ts`. Return the saved state and versions.
3. Describe each operation in `tools.ts` (stable name `housedash_<verb>`, description, input schema).
4. Register the feature in `src/features/shared/server/registry.ts`. The catalog, the generic API and the
   assistant pick it up automatically.
5. Connect the UI with `callFeature()` or a thin `withAuth` route. Show loading, empty, error and stale states.
6. Data format changes: see conventions above and [DATA.md](DATA.md).
7. Run the checks, update `node scripts/sync-housedash-source.mjs --manifest` and the docs.

## Deploying to your Pi

See [INSTALL.md](INSTALL.md), option 2. Never run two deployments at the same time; `deploy-pi.sh` holds a lock.
Releases for other households: [UPDATES.md](UPDATES.md).
