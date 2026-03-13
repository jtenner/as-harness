# Changelog

## 2026-03-13

- **docs: clarify import-backed assembly declarations** Update `docs/primary-buildout.md` to separate front-facing test APIs from the internal `test` / `describe` / `skip` / `todo` declaration primitives that call through WebAssembly imports. GitHub: *@jtenner*
- **tooling: add Biome-based validation workflow** Add Biome to `cli/`, initialize its config, add root `scripts/validate.ts` plus `bun validate`, and align `AGENTS.md` with the new validation command. GitHub: *@jtenner*
- **docs: add compact AGENTS guide and workflow rules** Add a concise project map plus validation, commit, and changelog rules in `AGENTS.md`. GitHub: `@jtenner`

### Added

- Added `harness/` as a placeholder for the AssemblyScript harness work.
- Added a new standalone `cli/` Bun package for the AssemblyScript harness work.
- Added Bun package metadata, scripts, and executable wiring for
  `@as-harness/cli`.
- Added a multi-target standalone build script in `cli/build.ts`.
- Added `cli/as/compile.ts` as the programmatic AssemblyScript compiler wrapper.
- Added `cli/runtime/` with shared runtime typing plus `js`, `wasmtime`, and
  `wazero` runtime stubs.
- Added `cli/n-api/` as a placeholder for bundled native modules.
- Added a repo-level changelog.

### Changed

- Expanded `cli/index.ts` from the Bun starter into a real CLI scaffold.
- Added top-level help and version handling.
- Added `list` command entry discovery for explicit file paths and glob-based
  scanning.
- Added scaffolded `run` command behavior.
- Added `run --help` with command-specific documentation.
- Added default test-entry discovery patterns:
  `**/*.{test,spec}.ts` and `test/**/*.ts`.
- Added `--glob` / `-g` and `--ignore` / `-i` support for entry discovery.
- Added `--coverage` and `--coverage-format` as parsed placeholders.
- Reworked the compiler wrapper to call AssemblyScript programmatically via
  `assemblyscript/asc` instead of shelling out.
- Reduced the exposed compiler option surface to the subset the harness intends
  to own.
- Forced harness-level compiler defaults for target, output path, debug mode,
  start-function export, and color handling.
- Changed compiler artifact handling from `Blob` output to structured artifacts
  with `path`, `contents`, and `contentType`.
- Implemented AssemblyScript `readFile` and `listFiles` hooks against the local
  filesystem.
- Introduced runtime-based compiler argument mutation through dependency
  injection.
- Replaced the short package README with detailed package-level documentation.

### Verified

- Verified Bun source execution for the CLI entrypoint.
- Verified `bun build --compile` output for every supported compile target.
- Verified `clean`, `build`, and `build:list-targets`.
- Verified `tsc --noEmit` for the `cli/` package.
