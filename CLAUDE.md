# HouseDash: working rules for AI assistants

Read before changing anything: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and, for data changes, [docs/DATA.md](docs/DATA.md).
Feature code lives in `src/features/<name>`.

- Talk to the maintainer in German. UI text is German. Docs and commit messages are English; new code comments
  in English (many existing comments are still German).
- Design for the 14″ touch screen first (1536×960 stage), then tablets and phones.
- Do not add or run automated tests. TypeScript, ESLint, the build and status checks on the Pi are fine.
- Exactly one Node process writes the JSON data. Never add replicas or external writers.
- Change data only through the stores and `withDataTransaction`; keep migrations, revisions, generations,
  conflict handling and the backup catalog intact. Never reset unknown newer data.
- Never copy secrets, calendar feed URLs, Telegram sessions or real family data into chat, Git, logs or build artifacts.
- Keep existing Docker volumes, `secrets.json`, the `hs-session` cookie and the Telegram session.
  Do not stop or remove other services on the Pi. No OS reboot during a deployment.
- Deploy with `scripts/Deploy-HouseDash.ps1` (ARM64 build on the PC). Ship new and removed source files with the source.
- No new cloud or AI accounts or paid APIs without being asked.
- Keep the MIT license and [NOTICE.md](NOTICE.md). Commit only when asked; never push to a remote without being asked.
- Commit messages follow Conventional Commits: `feat|fix|chore|docs|refactor|perf(scope): short summary`, then a blank
  line and a few bullet points on what changed and why. The maintainer is the only author: no `Co-Authored-By` or
  "Generated with" lines, no AI attribution.
