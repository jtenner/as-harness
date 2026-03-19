# Project Structure

- `cli/`: main Bun CLI package; entrypoint, compiler wrapper, runtime stubs, build script.
- `assembly/`: AssemblyScript package for Wasm-side work; config, roadmap, build/test scripts.
- `harness/`: host-runtime packages; `js/`, `wazero/`, and `wasmtime/` are working hosts.
- `docs/`: architecture, ABI, and planning docs.
- `CHANGELOG.md`: repo change history.

## Rules

- Keep this file compact.
- Validation deliverables: run `bun validate`, confirm zero diagnostics, run all primary test suites.
- Every commit needs a title and detailed body with changed files and reasons.
- Every commit must update `CHANGELOG.md`.
- Before commit, investigate `agent-todo.md` and update the tasks with new blockers, risks, and removing completed items.
- `agent-todo.md` must contain only actual remaining todo items for unreleased work; do not keep released-version notes, shipped scope summaries, or other retrospective content there.
- Organize `agent-todo.md` by upcoming version first, then within each version by `Blockers`, then `Risks`, then feature sections in implementation priority order, with each feature section listing only remaining work.
- Gitignore newly discovered build/cache directories when they are not meant to be tracked.
- Update relevant `README.md` files when surface API or user-facing project info changes.
- Write commit text to a temp file, commit with `git commit -F`, then delete the temp file.
- Changelog entries must include: date, bold title, short description, emphasized GitHub username of the changer.
