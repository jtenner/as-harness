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
- packaged targets include `js` and `wazero` (release matrix varies by platform), and the release workflow now ships target-specific archives that preserve the inner executable basename while keeping `wazero` bundled inside the executable
- packaged release assets stay archived instead of renaming the executable itself because current Bun standalone native-addon loading is sensitive to the compiled executable basename on Linux
- `wasmtime` is source-only
- CI and release install toolchains from repo-local [`.mise.toml`](../.mise.toml)
  through `jdx/mise-action@v4`
- Node.js `25.8.1` baseline
- Bun `1.3.11` baseline for packaged artifacts and repo automation
- Go `1.26.1` baseline for `wazero` source verification and packaged verification
- Rust `1.94.0` baseline for `wasmtime` source verification and packaged native build prerequisites

## Targets

- `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`, `bun-linux-x64`, `bun-windows-x64`
- Linux x64 and macOS x64 carry `wazero`; Linux arm64 and Windows do not

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
- full source-host matrix
- packaged CLI verification on release matrix

## Tagging

Release workflows trigger on `v*` tags.
Tag must match `cli/package.json` version.

## Failure triage

- release build failure: inspect target packaged smoke step
- verifier-wrapper failure: check wrapper logs first
- packaged build timeout: treat as build-budget exhaustion before blaming hosted verifier supervision
- packaged smoke timeout: treat as likely host hang before blaming the package itself
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
