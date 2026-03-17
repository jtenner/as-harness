# Scripts

`scripts/` contains the root validation and test entrypoints used from the repository root.

## What Exists Today

- `validate.ts`
  Runs Biome format and lint checks for `cli/`.
- `test.ts`
  Runs the root AssemblyScript-focused test flow:
  - compiles `assembly/assembly/test/index.ts`
  - runs the generated bootstrap module
  - compiles `node:assert` smoke fixtures
  - runs shared assertion smoke checks
- `test-bootstrap.ts`
  Loads the generated AssemblyScript test module under Bun and provides a minimal stub package for the guest-side `write_event` import.
- `assert-bridge-smoke.ts`
  Instantiates the compiled assertion smoke fixtures and verifies host-observed failure/trampoline behavior using the JavaScript WebAssembly runtime.
- `release-matrix.ts`
  Emits the supported GitHub-hosted release-target matrix used by the CI and release workflows.
- `verify-packaged-cli.ts`
  Builds one compiled CLI target, smoke-tests it through the packaged `js` path, smoke-tests the packaged `wazero` path when that target supports it, and can copy the resulting executable into a release-asset directory.

Package-local smoke suites also matter:

- `harness/js`: `npm test`
- `harness/wazero`: `npm test`

## What These Scripts Verify

- The CLI package stays formatted and lint-clean.
- The guest-side AssemblyScript runtime still compiles.
- Current `node:assert` bridge behavior still works.
- The package-local `JS host` and `wazero host` surfaces still pass their smoke tests when run directly.

## Packaging Confidence

These scripts now provide the local mirror of the packaged-CLI workflow, but the full release matrix still depends on GitHub-hosted runner execution.

What they cover now:

- source-level correctness
- local AssemblyScript compilation
- local host smoke coverage
- local `wazero host` addon builds on the current machine
- local packaged `single-file Bun executable` smoke tests for the selected release target

What they do not yet cover:

- historical proof that the GitHub Actions release matrix is green across every supported runner
- automated build/test coverage for every non-release Bun compile target
- explicit Linux `glibc` versus `musl` release validation

Multi-platform packaging now has workflow definitions in `.github/workflows/`, but it still needs sustained green runs to count as proven release infrastructure.
