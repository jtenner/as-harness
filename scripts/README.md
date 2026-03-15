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

Package-local smoke suites also matter:

- `harness/js`: `npm test`
- `harness/wazero`: `npm test`

## What These Scripts Verify

- The CLI package stays formatted and lint-clean.
- The guest-side AssemblyScript runtime still compiles.
- Current `node:assert` bridge behavior still works.
- The package-local `JS host` and `wazero host` surfaces still pass their smoke tests when run directly.

## Packaging Confidence

These scripts provide useful local confidence, but they are not yet release-grade packaging validation.

What they cover now:

- source-level correctness
- local AssemblyScript compilation
- local host smoke coverage
- local `wazero host` addon builds on the current machine

What they do not yet cover:

- a CI matrix across all Bun executable targets
- packaged `single-file Bun executable` smoke tests for the `JS host` and `wazero host` MVP paths
- automated build/test coverage for every `target-specific native artifact`
- explicit Linux `glibc` versus `musl` release validation

Multi-platform packaging will require CI expansion beyond the current root scripts.
