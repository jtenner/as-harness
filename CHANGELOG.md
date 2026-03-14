# Changelog

## 2026-03-14

- **strict-equality: add ordered array and StaticArray comparison** Add shared AssemblyScript strict-equality runtime helpers for ordered `Array<T>` and `StaticArray<T>` comparison, route generic value comparison through those branches before the managed-class fallback, reuse the active-pair and proven-pair machinery so nested recursive class elements terminate cleanly, expand AssemblyScript coverage for primitive arrays, static arrays, nested buffers, and arrays of recursive class graphs, regenerate bundled virtual sources, and update the checklist, docs, READMEs, and changelog to reflect that arrays and arraylikes are now implemented while typed arrays, sets, maps, and function references remain pending. GitHub: *@jtenner*
- **strict-equality: add specialized ArrayBuffer comparison** Add bytewise `ArrayBuffer` comparison to the shared AssemblyScript strict-equality runtime, route `ArrayBuffer` values through that path from the generic value comparator, introduce a dedicated generated-hook helper for `ArrayBuffer`-typed members, teach the transform to classify `ArrayBuffer` fields and getters separately from generic value members, expand AssemblyScript and transform coverage for buffer equality and helper selection, regenerate bundled virtual sources, and update the checklist, docs, READMEs, and changelog to reflect that `ArrayBuffer` comparison is now implemented while arrays, typed arrays, sets, and maps remain pending. GitHub: *@jtenner*
- **docs: sync strict-equality plan with managed-class recursion support** Update the strict-equality machinery design doc so the generated-hook contract and Phase 3 status accurately reflect the newly implemented managed-class recursion path through transform-generated hooks and shared pair tracking. GitHub: *@jtenner*
- **strict-equality: route managed-class recursion through generated hooks** Add a dedicated managed-class member helper to the shared AssemblyScript strict-equality runtime, use the existing active-pair and proven-pair tracking to recurse safely through instrumented class graphs including cycles, teach the transform to classify known class-typed fields and getters separately from primitive and collection-placeholder members, emit the managed-class helper only for those members, expand AssemblyScript and transform fixtures to cover recursive class comparison and helper selection, regenerate bundled virtual sources, and update the checklist, docs, READMEs, and changelog to reflect that managed-class recursion is now implemented while collection-specialized comparison remains pending. GitHub: *@jtenner*
- **strict-equality: add recursive pair tracking for reference comparisons** Add shared AssemblyScript strict-equality runtime state for active reference pairs and proven reference matches, implement the first reusable `Match` / `Fail` / `Defer` pair-comparison helper for recursive graphs, expand AssemblyScript coverage to prove deferred re-entry, pair-cache reuse, and cleanup on failure, regenerate bundled virtual sources, and update the checklist, docs, README, and changelog to reflect that cycle-tracking is now implemented. GitHub: *@jtenner*
- **strict-equality: add runtime-type guards and paired member comparison** Update the strict-equality transform so generated class hooks guard `other` by same-instance identity and runtime type before comparing members, change per-member delegation to pass both the local and casted peer member values into the shared runtime helper, add the first runtime type-id and string-comparison helpers on the AssemblyScript side, expand transform and AssemblyScript tests to cover the new contract, regenerate bundled virtual sources, and refresh the planning docs, READMEs, changelog, and checklist to match the new implementation state. GitHub: *@jtenner*
- **strict-equality: add member-helper delegation and primitive runtime checks** Extend the strict-equality transform so generated class hooks delegate each selected field and getter through shared runtime helper calls, add transform fixtures that assert the emitted helper-call AST shape, implement the first shared AssemblyScript equality helpers for primitive fast paths, nullable-reference identity, and `NaN` normalization, regenerate bundled virtual sources, and update the planning docs, READMEs, changelog, and checklist to reflect the new runtime and transform state. GitHub: *@jtenner*
- **strict-equality: add member selection and inherited hook bodies** Add transform-side participating-member selection for instance fields and getters, define the first member-hash representation for inherited-member suppression work, extend the generated hook scaffolds so derived classes delegate into `super`, add direct CLI compiler-wrapper tests for strict-equality transform auto-enablement, expand transform fixtures for fields, getters, generics, and inheritance, and update the planning docs and checklist. GitHub: *@jtenner*
- **strict-equality: add first contract and transform implementation pass** Define the strict-equality Phase 1 contracts in the design docs, add the initial AssemblyScript strict-equality runtime contract scaffold and tests, auto-enable the bundled transform for `node:assert` library builds, implement the first real class-instrumenting transform pass with namespace recursion and placeholder hook injection, add transform fixture coverage, and update the relevant README and checklist files. GitHub: *@jtenner*

## 2026-03-13

- **cli: bundle and materialize transform assets for asc** Add `cli/transform/` scaffolding plus a loadable no-op AssemblyScript transform entrypoint, extend the virtual-file generator to bundle precompiled JS transform assets alongside the virtual AssemblyScript sources, teach the compiler wrapper to hoist bundled transform files to a temp directory and rewrite `--transform` paths before invoking `asc`, update the strict-equality planning doc and checklist, and document the transform hoisting behavior in the CLI README. GitHub: *@jtenner*
- **assembly: add a host-managed trap trampoline for callback assertions** Add a staged `() => void` guest trampoline plus the `invoke_staged()` imported ABI, wire wazero to re-enter the guest through `invoke()` and map trap vs normal return into `0` or `1`, add smoke coverage for both paths, update the assembly checklist to mark the new minimal assertion primitive as defined, and document the boundary in the assembly and wazero READMEs. GitHub: *@jtenner*
- **docs: inventory node:test and node:assert adapter surfaces** Expand `assembly/assembly/node:test/TODO.md` and `assembly/assembly/node:assert/TODO.md` with Node `v25.8.x` API inventories, required function and type breakdowns, and an implementation-oriented design for the first `node:test` adapter pass so the Wasm runtime work can proceed from a concrete surface definition. GitHub: *@jtenner*
- **docs: require checklist updates before commit** Update `AGENTS.md` to require marking completed `agent-todo.md` items before commit when the corresponding work is actually done. GitHub: *@jtenner*
- **docs: audit assembly task checklist against implemented runtime work** Update `agent-todo.md` to mark only the AssemblyScript checklist items that are explicitly completed in the current codebase, leaving the remaining tasks unchecked instead of auto-completing inferred work. GitHub: *@jtenner*
- **assembly: add a lazy-discovery Node runtime model** Add `assembly/assembly/internal/node.ts` with a `Node` class that stores core node metadata, parent linkage, the discovery callback, lazily discovered children via `getChildren()`, and a global `rootNode` / `currentNode` pair for parent-aware child creation directly through `node.createChild(...)`, add internal AssemblyScript coverage for the new behavior, regenerate the bundled virtual sources, and update assembly package docs. GitHub: *@jtenner*
- **harness: instantiate wazero modules and copy NodeIndex input on run** Update the Go-based `harness/wazero` addon so `run(nodeIndex)` instantiates the compiled module, calls a new AssemblyScript `allocateNodeIndexBuffer(length)` export, copies the requested `NodeIndex` into guest memory, returns `true` or `false` for execution success, and documents the new host/guest ABI step. GitHub: *@jtenner*
- **assembly: clarify the exports placeholder entrypoint** Remove the internal test import from `assembly/assembly/exports.ts`, document that the file is intentionally empty until a CLI-driven export path exists, and regenerate the bundled virtual source copy. GitHub: *@jtenner*
- **cli: bundle virtual assembly sources into the compiler wrapper** Add generated bundled AssemblyScript source text for `~/.as-harness`, regenerate it during CLI builds, and update the compiler wrapper to serve virtual files from the bundled module instead of scanning the repo at runtime. GitHub: *@jtenner*
- **assembly: add exports entrypoint for future test modules** Add `assembly/assembly/exports.ts` as a dedicated Wasm-export entrypoint and update `assembly/README.md` to distinguish it from the current internal test barrel workflow. GitHub: *@jtenner*
- **docs: add assembly package readme** Add `assembly/README.md` describing the package layout, current internal runtime work, test workflow, and planned framework adapter structure. GitHub: *@jtenner*
- **docs: expand scripts readme coverage** Update `scripts/README.md` to document the root validation script, the AssemblyScript test runner, and the generated-Wasm bootstrap script. GitHub: *@jtenner*
- **assembly: add internal event serialization and test bootstrap** Add the `assembly/assembly/internal` runtime event modules, internal serializer tests, and a root Bun test script that compiles and bootstraps the AssemblyScript test entrypoint. GitHub: *@jtenner*
- **docs: add assembly adapter entry-point skeletons** Add initial `assembly/assembly/*` library-entry folders plus per-adapter `TODO.md` files for the first set of framework and assertion adapters. GitHub: *@jtenner*
- **docs: correct assembly adapter checklist structure** Update `agent-todo.md` so the API layer work is expressed as framework-specific `assembly/assembly/*` `--lib` entry points instead of a single generic front-facing API layer. GitHub: *@jtenner*
- **docs: add assembly buildout task checklist** Add `agent-todo.md` with grouped implementation tasks for the `assembly/` Wasm runtime based on `docs/primary-buildout.md`. GitHub: *@jtenner*
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
