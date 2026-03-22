# Release Process

Operational flow for shipping `as-harness` through GitHub:

1. run local validation
2. push to GitHub
3. let CI run source-host checks
4. tag `vX.Y.Z`
5. let release workflow build, verify, and publish artifacts

## Current policy

- official distribution: packaged Bun executables
- no current `npm` publication
- packaged targets include `js` everywhere and `wazero` on `bun-darwin-arm64`,
  `bun-darwin-x64`, and `bun-linux-x64`; `bun-linux-arm64` and
  `bun-windows-x64` stay `js`-only
- release packaging ships target-specific archives that preserve the inner
  executable basename while keeping `wazero` bundled inside the executable
- packaged release assets stay archived instead of renaming the executable itself because current Bun standalone native-addon loading is sensitive to the compiled executable basename on Linux
- `wasmtime` is source-only
- CI and release install toolchains from repo-local [`.mise.toml`](../.mise.toml)
  through `jdx/mise-action@v4`
- Node.js `25.8.1` baseline
- Bun `1.3.11` baseline for packaged artifacts and repo automation
- Go `1.26.1` baseline for `wazero` source verification and packaged verification
- Rust `1.94.0` baseline for `wasmtime` source verification and packaged native build prerequisites

## Targets

- packaged release targets:
  - `bun-darwin-arm64`: `js`, `wazero`
  - `bun-darwin-x64`: `js`, `wazero`
  - `bun-linux-arm64`: `js`
  - `bun-linux-x64`: `js`, `wazero`
  - `bun-windows-x64`: `js`
- source-host verification targets:
  - `linux-x64`, `linux-arm64`, `macos-arm64`, `macos-x64`, `windows-x64`
  - each source-host target validates `js`, `wazero`, and `wasmtime`
  - native-host CLI smoke in that matrix builds a Node-targeted CLI bundle
    with Bun and runs it under the matching Node baseline instead of invoking
    `bun run ./cli/index.ts` directly

## Preflight

```bash
mise trust
mise install
bun validate
bun test
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
bun run release:matrix
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
```

Source-host verification proof is intentionally different from packaged proof:

- `verify:source-hosts` builds a Node-targeted CLI bundle and runs that bundle
  under the configured Node baseline so native source hosts are exercised
  without depending on Bun's direct Windows native-addon path
- `verify:packaged-cli` stages the real packaged Bun executable from the
  release archive under a sanitized runtime environment and verifies the
  bundled hosts from that clean install shape

Inspect lists locally:

```bash
mise trust
mise install
cd cli
bun run build:list-release-targets
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
```

## CI expectations

- repo validation
- root Bun tests
- full source-host matrix through the Node-targeted source CLI bundle
- packaged CLI verification on the release matrix through staged Bun executables

## Tagging

Release workflows trigger on `v*` tags.
Tag must match `cli/package.json` version.

## Failure triage

- release build failure: inspect target packaged smoke step
- verifier-wrapper failure: check wrapper logs first
- packaged build timeout: treat as build-budget exhaustion before blaming hosted verifier supervision
- packaged smoke timeout: treat as likely host hang before blaming the package itself
- source-host smoke failure on Windows: confirm the generated Node-targeted CLI
  bundle path and `AS_HARNESS_SOURCE_CLI_REPO_DIR` wiring before blaming the
  native host package
- non-matching tag/version: align `cli/package.json` and tag

## Non-goals

- no `npm` publishing
- no packaged `wasmtime`
- no scope change without explicit matrix/provenance updates

## Related files

- `.github/workflows/release.yml`
- `scripts/release-manifest.ts`
- `scripts/verify-packaged-cli.ts`
- `scripts/release-matrix.ts`
- `scripts/stage-release-legal.ts`
- `scripts/host-validation-matrix.ts`
- `cli/build-targets.ts`
- `docs/007-2026-03-17-host-runner-contract.md`
