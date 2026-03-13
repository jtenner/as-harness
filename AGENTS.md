# Project Structure

- `cli/`: main Bun CLI package; entrypoint, compiler wrapper, runtime stubs, build script.
- `assembly/`: AssemblyScript package for Wasm-side work; config, roadmap, build/test scripts.
- `harness/`: placeholder host-runtime implementations (`js/`, `wasmtime/`, `wazero/`).
- `docs/`: architecture and planning docs.
- `CHANGELOG.md`: repo change history.

## Rules

- Keep this file compact.
- Validation deliverables: formatting, zero diagnostics, all primary test suites.
- Every commit needs a title and detailed body with changed files and reasons.
- Every commit must update `CHANGELOG.md`.
- Update relevant `README.md` files when surface API or user-facing project info changes.
- Write commit text to a temp file, commit with `git commit -F`, then delete the temp file.
- Changelog entries must include: date, bold title, short description, emphasized GitHub username of the changer.
