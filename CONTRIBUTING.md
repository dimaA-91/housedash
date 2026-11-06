# Contributing

Thanks for your interest in HouseDash. It is a small family project; issues and pull requests are welcome.

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Open an issue for larger changes first, so we can agree on the approach.
- Security problems: see [SECURITY.md](SECURITY.md), do not open a public issue.

## Guidelines

- Commit messages: Conventional Commits (`feat|fix|chore|docs|refactor|perf(scope): summary`), then a few bullet points.
- UI text in German; docs and commit messages in English. New code comments in English (many existing comments
  are still German).
- One domain implementation per feature in `src/features/<name>`, shared by the UI, the API and the assistant.
- All writes through the stores and `withDataTransaction`. Data format changes need a schema version, a migration,
  a backup section and documentation in [docs/DATA.md](docs/DATA.md).
- Keep the wall display first (1536×960, touch targets ≥ 48 px) and check tablet and phone layouts.
- No telemetry and no new cloud services without discussion.

## Checks

```powershell
npx tsc --noEmit
npm run lint
npx next build
```

There is no automated test suite. Describe in the pull request how you checked the change
(screens, devices, Pi or local only).

## License

By contributing you agree that your contribution is licensed under the MIT License of this project.
