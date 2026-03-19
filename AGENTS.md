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
- Mark completed items in `agent-todo.md` before commit when the corresponding work is actually done.
- Before commit, investigate `agent-todo.md` and update the tasks with new blockers, risks, and removing completed items.
- Gitignore newly discovered build/cache directories when they are not meant to be tracked.
- Update relevant `README.md` files when surface API or user-facing project info changes.
- Write commit text to a temp file, commit with `git commit -F`, then delete the temp file.
- Changelog entries must include: date, bold title, short description, emphasized GitHub username of the changer.
