# Release Process

This document is the operational guide for shipping `as-harness` `v0.1.x` releases through the current GitHub workflow.

## Release Contract

The current release channel is:

1. validate locally
2. push to GitHub
3. let CI finish on the intended matrix
4. tag `vX.Y.Z`
5. let the release workflow build, verify, and publish the packaged executables

This is separate from the source-host validation matrix in normal CI. Packaged
release verification and source-host verification are intentionally not the same
matrix.

The packaged targets currently intended for release are:

- `bun-darwin-arm64`
- `bun-darwin-x64`
- `bun-linux-arm64`
- `bun-linux-x64`
- `bun-windows-x64`

Packaged harness support is:

- macOS: `js`, `wazero`
- Linux x64: `js`, `wazero`
- Linux arm64: `js` only
- Windows: `js` only

Source-only harness support also includes `wasmtime`, but it is not yet part of
the packaged release artifact matrix.

## Local Preflight

Run the release baseline from the repo root:

```bash
bun validate
bun test
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
cd /path/to/as-harness
bun run release:matrix
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
```

If you want to inspect the exact packaged release target list locally:

```bash
cd cli
bun run build:list-release-targets
```

If you want to inspect the source-host validation matrix locally:

```bash
bun run host:matrix
```

If you want to run one source-host proof target locally and emit the same
report shape CI uploads:

```bash
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
```

## CI Expectations

The main workflow should be green before tagging:

- repo validation
- root Bun tests
- source-host smoke coverage across the explicit CI matrix runners
- packaged CLI verification on the release matrix

The packaged verification path is owned by [verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts).
The source-host matrix is emitted by [host-validation-matrix.ts](../scripts/host-validation-matrix.ts).
The per-target source-host verification reports are emitted by [verify-source-hosts.ts](../scripts/verify-source-hosts.ts).
The per-target packaged clean-environment reports are emitted by [verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts).

## Tagging

The release workflow triggers on tags matching `v*`.

The tag must match the CLI package version in [package.json](../cli/package.json). For example:

- CLI version `0.1.0`
- release tag `v0.1.0`

The release-manifest generator will fail if those drift.

## Published Assets

The release workflow publishes:

- one packaged executable per release target
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`
- tracked third-party license texts copied from `licenses/`
- `release-manifest.json`
- `SHA256SUMS.txt`

`release-manifest.json` records:

- release tag
- CLI version
- target metadata
- packaged harness support
- runner provenance
- SHA-256 checksum per packaged executable

`SHA256SUMS.txt` contains the binary checksums in a standard two-column format.

The legal bundle is staged by [stage-release-legal.ts](../scripts/stage-release-legal.ts).

## Clean-Environment Smoke Expectation

For each supported platform, the clean-environment expectation is:

1. download the packaged executable for that platform
2. run a minimal `node:test` smoke file through the default `js` harness
3. run the same smoke file through `--harness wazero` when that packaged target declares `wazero`
4. confirm the reported harness matches the target contract

Windows packaged artifacts are expected to stop at step 2 because they are intentionally `js`-only right now.

The current packaged verification helper models this by:

1. building the selected packaged target
2. copying the release-named executable into a temporary install directory
3. creating a separate temporary project directory with a minimal smoke file
4. running the staged executable from that separate project directory
5. optionally writing JSON and Markdown proof reports for the target

## If A Release Fails

- packaged build failure: inspect the target-specific packaged smoke step first
- `wazero` build failure: inspect the Node headers, Go toolchain, or addon staging path on that runner
- tag/version mismatch: update [package.json](../cli/package.json) or retag to match
- manifest/checksum failure: confirm the release asset directory contains the expected packaged executables before publish

## Related Files

- Workflow: [.github/workflows/release.yml](../.github/workflows/release.yml)
- Release metadata: [scripts/release-manifest.ts](../scripts/release-manifest.ts)
- Legal staging: [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts)
- Packaged smoke verification: [scripts/verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts)
- Release target map: [cli/build-targets.ts](../cli/build-targets.ts)
