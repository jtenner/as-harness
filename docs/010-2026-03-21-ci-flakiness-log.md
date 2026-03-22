# CI Flakiness Log For March 2026

This note answers which CI failures and flaky behaviors were encountered while stabilizing `as-harness` on March 21, 2026, recommends the concrete repo-level mitigations that proved effective, and covers the affected release, packaged-verification, source-host, and `wazero` runtime paths. The current recommendation is to keep CI and local toolchains unified through `mise`, keep packaged smoke execution isolated from tool-manager environment drift, treat Windows spawned-process temp cleanup as retry-based by default, and keep the remaining bundled Linux `wazero` compiler-engine risk explicitly tracked until it is reproduced and fixed without the current interpreter fallback.

## Scope

- CI workflow runs on GitHub-hosted Linux, macOS, and Windows runners
- packaged CLI verification in [`scripts/verify-packaged-cli.ts`](/home/jtenner/Projects/as-harness/scripts/verify-packaged-cli.ts)
- source-host verification in [`scripts/verify-source-hosts.ts`](/home/jtenner/Projects/as-harness/scripts/verify-source-hosts.ts)
- bundled `wazero` runtime loading in [`cli/runtime/wazero.ts`](/home/jtenner/Projects/as-harness/cli/runtime/wazero.ts)
- package-local native host smoke suites in [`harness/wazero/test/smoke.host.cjs`](/home/jtenner/Projects/as-harness/harness/wazero/test/smoke.host.cjs) and [`harness/wasmtime/test/smoke.host.cjs`](/home/jtenner/Projects/as-harness/harness/wasmtime/test/smoke.host.cjs)

## Incidents

### 1. Packaged Linux `wazero` smoke timed out on hosted CI

- Symptom: `Packaged CLI (bun-linux-x64)` timed out after 60 seconds while verifying the packaged executable, often with trace output stopping at `resolving bundled wazero harness module`.
- Root cause: the staged packaged smoke process was inheriting the full CI environment, including tool-manager variables that did not match the intended “clean staged executable” contract.
- Fix: `verify-packaged-cli.ts` now builds a small cross-platform environment whitelist for packaged smoke commands, uses the same sanitized environment for the trace rerun, and gives the packaged process a verifier-owned temp directory so Bun's embedded `.node` extraction path does not depend on runner-global temp configuration.
- Follow-up: the packaged Linux `wazero` hang still reproduced after the verifier-owned temp-root change, so the runtime now stops relying on Bun's special standalone embedded `.node` loader for packaged `wazero` and instead controls addon extraction plus `process.dlopen(...)` directly from repo code.
- Status: fixed for the current packaged verification path.

### 2. Packaged verification used the same timeout budget for build and smoke

- Symptom: first-time native addon builds on hosted macOS x64 timed out at 60 seconds even though the actual packaged smoke path had not failed.
- Root cause: the verifier treated package construction and packaged execution as the same failure class.
- Fix: packaged build steps now get a separate 180 second timeout budget while smoke commands remain at 60 seconds.
- Status: fixed.

### 3. Root CLI tests assumed a prebuilt source `wazero` addon

- Symptom: `bun test` on GitHub Ubuntu failed with multiple `cli/run.test.ts` `wazero` cases returning exit code `3`.
- Root cause: the root test suite exercised the source `wazero` host even when [`harness/wazero/dist/wazero.node`](/home/jtenner/Projects/as-harness/harness/wazero/dist/wazero.node) had not been built.
- Fix: source `wazero` CLI coverage now runs only when the built source addon is actually present, matching the existing `wasmtime` source-host gating model.
- Status: fixed.

### 4. GitHub workflow toolchains lagged the repo's native host requirements

- Symptom: packaged Linux verification failed while building the local `wazero` addon with `go.mod requires go >= 1.26.0`.
- Root cause: CI was still provisioning an older Go version than the repo's `harness/wazero/go.mod` requirement.
- Fix: the repo moved to a checked-in `mise` contract and now provisions Bun, Node, Go, and Rust from [`.mise.toml`](/home/jtenner/Projects/as-harness/.mise.toml) in CI and locally.
- Status: fixed, but upstream stable rollovers remain an expected maintenance task.

### 5. GitHub Actions emitted Node 20 deprecation warnings

- Symptom: otherwise healthy runs still produced warnings because some actions were executing on Node 20.
- Root cause: the workflow was pinned to older action majors, including `jdx/mise-action@v3`.
- Fix: workflows were updated to current action majors, including `jdx/mise-action@v4`, which runs on Node 24.
- Status: fixed for the repo-managed workflow actions.

### 6. `setup-go` caching was pointed at the wrong path

- Symptom: GitHub emitted cache warnings because the workflow root did not contain a `go.mod`.
- Root cause: the cache input assumed a repository-root Go module, but the real module lives under [`harness/wazero/go.mod`](/home/jtenner/Projects/as-harness/harness/wazero/go.mod).
- Fix: the cache path was pointed at the real `wazero` module.
- Status: fixed. This became moot after moving CI fully onto `mise`, but the underlying configuration bug was still real.

### 7. Windows source-host smoke failed with `spawnSync npx.cmd EINVAL`

- Symptom: the Windows source-host matrix failed before running host logic because the shared AssemblyScript smoke compiler could not launch `npx.cmd`.
- Root cause: [`harness/shared/smoke-suite.cjs`](/home/jtenner/Projects/as-harness/harness/shared/smoke-suite.cjs) was invoking `npx.cmd asc ...` through a path that GitHub Windows/Node rejected.
- Fix: the shared smoke compiler now executes the repo-local AssemblyScript CLI entrypoint `assembly/node_modules/assemblyscript/bin/asc.js` via `process.execPath`.
- Status: fixed.

### 8. Bun standalone native-addon loading was sensitive to packaged executable renaming

- Symptom: investigating packaged `wazero` behavior showed pressure toward shipping a `.node` sidecar or renaming the compiled executable per target.
- Root cause: Bun standalone native-addon resolution on Linux was sensitive to the packaged executable basename.
- Fix: release assets now preserve a stable inner executable name (`as-harness` or `as-harness.exe`) inside target-specific archives instead of renaming the executable itself.
- Status: fixed for current release packaging, with no `.node` sidecar in the shipped assets.

### 9. Windows source-host `wazero` smoke passed functionally but failed temp-directory cleanup

- Symptom: the Windows Node 25 source-host matrix reported three `wazero` smoke failures after successful CLI execution because `rmSync(..., { recursive: true, force: true })` raised `EPERM` on the test temp directory.
- Root cause: GitHub Windows could leave short-lived handles on spawned-process temp trees after the child process had exited.
- First fix: the native host smoke suites switched to explicit recursive retry semantics (`maxRetries` plus `retryDelay`) instead of assuming immediate handle release.
- Follow-up: hosted Windows still outlived the initial retry window, so the retry budget was widened to a 10 second total envelope shared by both native source-host smoke suites.
- Status: fixed locally and queued for re-verification in CI.

## Remaining Open Risk

### Bundled Linux `wazero` still forces the interpreter engine

- Symptom: packaged Linux `wazero` historically hung in hosted CI during bundled native harness creation when using the compiler engine path.
- Current mitigation: [`cli/runtime/wazero.ts`](/home/jtenner/Projects/as-harness/cli/runtime/wazero.ts) still forces the interpreter engine for bundled Linux builds.
- Why this is still open: the interpreter fallback preserves the bundled feature and keeps packaged verification green, but it is not the final desired `wazero` runtime policy.
- Tracking: this remains explicitly listed in [`agent-todo.md`](/home/jtenner/Projects/as-harness/agent-todo.md).

## Working Rules That Proved Useful

- Keep CI and local toolchains pinned in one checked-in `mise` file instead of maintaining per-tool setup drift across workflows.
- Treat packaged smoke processes as real staged executables, not as children of the full CI shell environment.
- Separate “package build timed out” from “packaged command timed out” because they imply different fixes and different regressions.
- Prefer repo-local tool entrypoints over shell shims on Windows when the shim adds a second layer of process resolution.
- Use retry-based cleanup for spawned-process temp trees on Windows, even when the child process exited cleanly.
- Keep unresolved flake mitigations visible in [`agent-todo.md`](/home/jtenner/Projects/as-harness/agent-todo.md) so temporary runtime policies do not become invisible permanent behavior.
