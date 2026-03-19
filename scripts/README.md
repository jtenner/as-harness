# Scripts

`scripts/` contains the root helper scripts used for validation, smoke coverage, and release-matrix support.

## Main Scripts

- `validate.ts`
  Runs Biome format and lint checks for `cli/`.
- `test.ts`
  Runs the repo-level AssemblyScript-focused test flow, assertion bridge smoke
  coverage, and the package host smoke suites for `js`, `wazero`, and
  `wasmtime`.
- `test-bootstrap.ts`
  Loads the compiled AssemblyScript bootstrap fixture under Bun.
- `assert-bridge-smoke.ts`
  Verifies host-observed assertion behavior against compiled smoke fixtures.
- `release-matrix.ts`
  Emits the release-target matrix consumed by GitHub Actions.
- `host-validation-matrix.ts`
  Emits the source-host validation matrix consumed by GitHub Actions.
- `verify-source-hosts.ts`
  Runs the expected source-host package build/test commands for one matrix
  target, verifies that the active `node` on `PATH` matches the target's
  declared baseline, and writes JSON/Markdown proof reports.
- `release-manifest.ts`
  Emits `release-manifest.json`, `SHA256SUMS.txt`, and release-notes text from the shared release-target metadata.
- `stage-release-legal.ts`
  Copies `THIRD_PARTY_NOTICES.md` and the tracked third-party license texts into a release asset directory.
- `verify-packaged-cli.ts`
  Builds one packaged CLI target, stages the release-named executable into a temporary install directory, runs its smoke path from a separate temporary project directory with a bounded subprocess timeout, optionally copies the verified asset into a release directory, and can emit JSON/Markdown proof reports.

## What These Scripts Prove

- the CLI formatting and lint baseline
- the guest runtime still compiles
- the assertion bridge still works
- the package host smoke suites still pass through the root test entrypoint
- the source-host matrix is explicit rather than hard-coded into one CI job
- the explicit first supported source-host Node baseline is Node.js 22
- source-host proof now produces persisted per-target reports instead of relying only on CI step names
- the packaged CLI path still works locally for a selected release target
- the packaged CLI path works from a clean staged install-like directory instead of only beside the repo checkout
- the release workflow can publish explicit artifact metadata instead of relying on inferred platform behavior
- the published release assets have checksums and tag/version consistency checks
- the published release assets now include the tracked third-party legal bundle

## What They Do Not Prove

- that every hosted runner in GitHub Actions is green
- that every target-specific wazero build works in the wild
- that end-user install and troubleshooting flows are polished

Those are still release-proof tasks above the local helper layer.

## Useful Commands

```bash
bun validate
bun test
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
bun run release:matrix
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
bun run release:manifest -- --tag v0.1.0 --asset-dir ./dist/release-assets --notes-file ./dist/release-notes.md
```

## Related Docs

- Repo overview: [README.md](../README.md)
- CLI docs: [cli/README.md](../cli/README.md)
- Release process: [docs/004-2026-03-17-release-process.md](../docs/004-2026-03-17-release-process.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
