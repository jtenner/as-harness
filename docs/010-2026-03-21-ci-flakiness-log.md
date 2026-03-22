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
- Follow-up: the packaged Linux `wazero` hang still reproduced after the verifier-owned temp-root change, so the runtime stopped relying on Bun's special standalone embedded `.node` loader and moved addon extraction into repo code. The first repo-controlled loader still used `process.dlopen(...)` with a synthetic module record, which executed correctly but still hung on hosted Linux teardown after the packaged command had already reported `PASS`.
- Final fix: keep the repo-controlled addon extraction, but load the extracted absolute `.node` path through normal `require(...)` resolution instead of manual `process.dlopen(...)`. That preserves bundling, keeps the addon out of sidecars, and lets the packaged process exit cleanly in local reproduction.
- Status: fixed locally and queued for CI re-verification.

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
- Follow-up: hosted Windows still outlived both the initial retry window and Node's built-in `rmSync(..., { maxRetries, retryDelay })` behavior, so cleanup moved to a repo-owned retry loop that explicitly catches retryable temp-tree removal errors and sleeps between attempts.
- Status: fixed locally and queued for CI re-verification.

### 10. Windows source-host native-host CLI smoke still failed under Bun after cleanup was fixed

- Symptom: after the temp-directory cleanup race was removed, the Windows Node 25 source-host matrix still failed three `wazero` CLI smoke assertions with exit code `3` while the same native host passed all in-process harness checks.
- Root cause: the CLI source runtime was still depending on Bun to resolve the source native addon from repo-relative specifiers, leaving a Windows-specific Bun boundary distinct from both the packaged path and the in-process Node smoke path.
- First fix: the source `wazero` runtime started routing both the main thread and worker-thread path through a shared absolute-path CJS harness module in [`cli/runtime/wazero-source-worker.cjs`](/home/jtenner/Projects/as-harness/cli/runtime/wazero-source-worker.cjs), and the native smoke suite now prints spawned CLI stdout and stderr whenever a future assertion fails so the next hosted failure is directly diagnosable from the report artifact.
- Final fix: Bun on GitHub Windows was still crashing when that shared source harness module loaded the repo-built [`harness/wazero/dist/wazero.node`](/home/jtenner/Projects/as-harness/harness/wazero/dist/wazero.node) directly, so the source loader now stages a private temporary copy of the addon before `require(...)` whenever the CLI is running under Bun on Windows. That keeps worker-thread support intact while avoiding the direct repo-path native-addon boundary that was still segfaulting.
- Follow-up: that still left the broader Bun-on-Windows native-addon crash class open for source CLI execution itself. The stable repo-level mitigation was to keep packaged verification on real Bun executables, but change source-host verification to build a Node-targeted source CLI bundle with Bun and execute that bundle under the same Node 25 runtime the source-host matrix already provisions. The native source runtimes now honor `AS_HARNESS_SOURCE_CLI_REPO_DIR` so the bundled Node CLI can still resolve the repo-local `wasmtime` and `wazero` hosts.
- Upstream context: Bun still has open Windows native-addon crash reports in this area, including [`oven-sh/bun#13566`](https://github.com/oven-sh/bun/issues/13566) and [`oven-sh/bun#15551`](https://github.com/oven-sh/bun/issues/15551).
- Status: fixed locally and queued for CI re-verification.

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
