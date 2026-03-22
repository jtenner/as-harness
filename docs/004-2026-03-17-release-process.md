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
- packaged targets include `js` and `wazero` (release matrix varies by platform)
- `wasmtime` is source-only
- explicit Node.js 22 baseline
- Bun `1.3.11` build baseline for packaged artifacts and CI

## Targets

- `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`, `bun-linux-x64`, `bun-windows-x64`
- Linux x64 and macOS x64 carry `wazero`; Linux arm64 and Windows do not

## Preflight

```bash
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
- packaged timeout: treat as likely host hang before blaming the package itself
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
