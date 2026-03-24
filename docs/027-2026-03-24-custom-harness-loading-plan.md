# Custom Harness Loading Plan

This note answers how `as-harness` should expand `--harness` so consumers can run tests through repo-local or npm-installed custom hosts instead of only the shipped `js`, `wazero`, and `wasmtime` names. The recommendation is: keep the three built-in names reserved, treat any other relative path, absolute path, or package specifier as a custom harness module resolved from the invoking project, normalize that module onto the current host-runner contract, and keep direct `.ts` harness loading explicitly Bun-only until the repo owns a Node-safe transpile path. This affects `cli/index.ts`, `cli/run.ts`, `cli/runtime/*`, source-host verification, and the CLI/README documentation.

## Current State

- `cli/runtime/resolve.ts` hard-rejects any `--harness` value other than `js`, `wazero`, or `wasmtime`.
- `cli/run.ts` uses the selected `Runtime` both to mutate compiler arguments and to create the execution harness.
- `cli/runtime/types.ts` defines the `Runtime` contract as `{ name, mutateCompilerArguments, createHarness }`.
- the host-side harness object contract itself already lives in `docs/007-2026-03-17-host-runner-contract.md` and `harness/shared/harness-types.d.ts`
- `cli/README.md` still lists external harness loading as "Not yet"
- the repo's source-host proof path builds a Node-targeted CLI bundle and runs it under Node, so any custom-harness design has to say exactly what happens when a user points `--harness` at a `.ts` file

## Goals

- keep `--harness js|wazero|wasmtime` fully backwards-compatible
- allow `--harness` to accept:
  - repo-relative filesystem paths such as `./tools/my-harness.js`
  - absolute filesystem paths such as `/work/project/tools/my-harness.node`
  - package specifiers such as `custom-harness` or `@scope/custom-harness`
- keep the custom harness author contract close to the shipped host contract instead of inventing a second plugin API
- resolve custom harness modules from the invoking project rather than from the CLI package directory
- preserve clear failure boundaries between harness resolution failures and host execution failures

## Non-Goals

- no remote URL loading
- no directory auto-discovery or "guess the entry file" behavior for filesystem selectors in the first slice; path-based selectors should point at one explicit file
- no new Wasm ABI or scheduler-step contract for custom harnesses
- no promise that direct `.ts` harness files work inside the Node-targeted source-host bundle until the CLI owns that transpilation path

## Selector Grammar

The CLI should treat `--harness` as a `HarnessSpecifier` with this precedence:

1. exact built-in alias: `js`, `wazero`, `wasmtime`
2. relative filesystem path: strings beginning with `./`, `../`, `.\`, or `..\`
3. absolute filesystem path: POSIX root paths, Windows drive paths, or UNC paths
4. package specifier: any other non-empty string

Important compatibility rule: built-in aliases win before package resolution, so a user package literally named `js` or `wazero` cannot shadow the shipped runtimes.

The user-facing docs can keep the phrase "package URL" if desired, but the implementation should treat these values as normal Node/Bun package specifiers resolved through the consuming project.

## Filesystem And Package Resolution

Custom harness resolution should be rooted at the CLI invocation `cwd`.

Filesystem selectors:

- relative paths resolve against `cwd`
- absolute paths are used as-is
- the first slice should accept explicit file targets ending in `.js`, `.cjs`, `.mjs`, `.node`, or `.ts`
- path selectors that resolve to a directory, a missing file, or an unsupported extension should fail during harness resolution with a targeted error

Package selectors:

- resolve through the consuming project's package graph, not through `@as-harness/cli`
- support scoped and unscoped package names, and allow package-export subpaths if the resolver already accepts them
- reject `node:`, `bun:`, `http:`, and `https:` style protocol specifiers in this slice so custom harness loading stays local and package-manager-owned

## Custom Module Contract

The custom module should normalize onto the existing `Runtime` contract rather than define a second plugin shape.

Accepted module shapes, in priority order:

1. `default` export object with `createHarness(...)`
2. named `runtime` export object with `createHarness(...)`
3. module namespace object exposing `createHarness(...)` directly

Required field:

- `createHarness(bytes, options?) => Harness`

Optional fields:

- `name: string` used by CLI reporting; if absent, derive the display name from the package name or file basename
- `mutateCompilerArguments(args)` for advanced hosts that need compile-time flag changes beyond the default wrapper contract

This keeps authoring simple for packages that already look like the shipped `harness/js`, `harness/wazero`, or `harness/wasmtime` entrypoints while still allowing a fuller runtime object when needed.

## Compile-Time Behavior

Today the CLI assumes the selected runtime is also the compile-time runtime. That should loosen for custom harnesses.

Recommended rule:

- built-in runtimes keep their current `Runtime` objects unchanged
- custom harnesses compile with the existing default wrapper behavior, including `--exportStart __start`
- after compilation, the resolved custom module provides the execution harness

Reasoning: the host ABI and the current wrapper export surface are already documented and shared across runtimes. Requiring every custom harness author to understand or re-implement compile-time CLI mutation would raise the bar for no clear gain. The optional `mutateCompilerArguments(...)` hook stays available for advanced hosts that really need it.

## Loading Semantics By File Type

- `.js`, `.cjs`, and `.mjs` should work in both the Bun CLI path and the Node-targeted source-host bundle, subject to normal module-system rules
- `.node` should be loaded through `require(...)` so a native addon can directly export `createHarness(...)`
- `.ts` should be supported only when the CLI is executing on Bun; the Node-targeted source-host bundle should fail fast with an explicit "custom TypeScript harness files require Bun" error until the repo owns a stable transpile-or-loader path

This is the main compatibility constraint surfaced by the current repo state. The requested `.{node,ts,js}` shape is still supported, but the `.ts` case needs an explicit environment rule instead of being treated as universally interchangeable with `.js`.

## Diagnostics

Harness resolution should report precise failure classes:

- unsupported selector syntax or reserved protocol
- missing file or package
- unsupported filesystem extension
- `.ts` custom harness used outside Bun
- module loaded successfully but does not expose a valid `createHarness(...)`
- custom `mutateCompilerArguments(...)` throws

Keep these as "Harness resolution failed: ..." messages so they stay distinct from later "Host execution failed: ..." errors raised by `createHarness(...)` or `start()`.

## Proof And Validation

The work should refresh proof at three levels:

- parser/unit coverage for built-in aliases, relative paths, absolute paths, package specifiers, and reserved protocol rejection
- CLI execution coverage proving built-in aliases still work, a repo-local `.js` harness file works, and a package-based custom harness resolves from the invoking project
- Node-targeted source-host proof that `.js` custom harness loading works there and `.ts` custom harness loading fails with the targeted compatibility error instead of a generic module-loader crash

If direct `.node` end-to-end smoke is too expensive for the first slice, keep resolver and normalization coverage for `.node` selectors plus one follow-up fixture task for a minimal native addon that exports the full contract.

## Recommended Slices

### CH-001 Define the `--harness` selector grammar and backwards-compatible precedence

Replace the current "supported names only" validation with a classifier that distinguishes built-in aliases, filesystem paths, and package specifiers while keeping `js`, `wazero`, and `wasmtime` reserved.

### CH-002 Resolve relative, absolute, and package harness specifiers from the invoking project

Add project-rooted resolution so `./...` resolves from `cwd`, absolute paths stay absolute, and package specifiers resolve from the consuming project's dependency graph instead of from the CLI package.

### CH-003 Normalize custom modules onto the shipped runtime contract

Load custom modules, accept the documented `default` / `runtime` / direct `createHarness(...)` shapes, derive a stable runtime name for reporting, and surface targeted module-shape errors when normalization fails.

### CH-004 Split compile defaults from built-in-only runtime validation

Stop rejecting non-built-in `--harness` values before compilation. Built-ins keep their current runtime objects; custom harnesses use the default compile wrapper contract plus any optional custom `mutateCompilerArguments(...)` hook.

### CH-005 Tighten diagnostics and reporter naming for external harnesses

Add the targeted resolution errors listed above and make reporter output use the custom harness display name so success and failure summaries do not misleadingly say `with js` for external hosts.

### CH-006 Add fixture-backed proof for built-in, path, and package harness selection

Extend parser and CLI tests with repo-local custom-harness fixtures, prove that built-in aliases still behave the same, and add at least one package-resolution fixture that exercises consuming-project `node_modules` lookup instead of repo-local shortcut loading.

### CH-007 Keep `.ts` custom harness loading explicitly Bun-only and prove the Node-bundle fallback

Add Bun-path proof for a `.ts` custom harness file, then add Node-targeted source-host proof that the same selector fails with the explicit compatibility message rather than an opaque loader error. Track any deeper Node-side transpile path as a later enhancement, not a hidden requirement for this slice.

### CH-008 Refresh help text, README guidance, and custom-author documentation

Update CLI help, `README.md`, `cli/README.md`, and the host-contract references so the user-facing docs explain the accepted `--harness` forms, the custom module contract, the `.ts`/Bun compatibility rule, and the difference between built-in aliases and external harness modules.

## Recommendation

Treat this as one user-facing feature with eight implementation slices. The highest-risk edge is not the loader itself; it is silently overpromising `.ts` parity across the repo's existing Bun and Node proof paths. Keeping that rule explicit gives the project a shippable first custom-harness surface without reopening the stable host ABI or the current packaged/source-host split.
