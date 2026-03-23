# Scripts

`scripts/` contains repo-level helper scripts for validation, smoke proof, and release workflow.

## Script Map

- `format.ts` — run Biome, `gofmt`, and `cargo fmt`.
- `validate.ts` — check format baseline and run CLI lints.
- `test.ts` — repo test flow including AssemblyScript smoke + host package tests (`js`, `wazero`, `wasmtime`).
- `test-bootstrap.ts` — run the compiled AssemblyScript bootstrap fixture.
- `assert-bridge-smoke.ts` — verify assertion bridge behavior through compiled fixtures.
- `release-matrix.ts` / `host-validation-matrix.ts` — emit release and source-host matrices.
- `source-host-smoke.ts` — shared source-host smoke command map used by repo and matrix test flows.
- `verify-source-hosts.ts` — execute source-host package smoke commands for a
  matrix target and emit source-host reports; native host smoke inside those
  package tests builds a Node-targeted CLI bundle.
- `release-manifest.ts` — generate `release-manifest.json`, `SHA256SUMS.txt`, and notes.
- `stage-release-legal.ts` — gather third-party legal files into a release artifact directory.
- `packaged-command-runner.ts` — timeout-safe Node command wrapper used by packaged verification.
- `verify-packaged-cli.ts` — run packaged CLI smoke with phase-specific
  timeout-safe supervision, a sanitized packaged runtime environment, and emit
  target-specific release archives when `--asset-dir` is provided.

## What These Scripts Prove

- formatting and CLI lint baseline
- guest compile flow
- assertion bridge parity
- shared host smoke suites for all shipped hosts
- source-host matrix execution with persisted reports and a Bun-built
  Node-targeted CLI bundle for native-host smoke
- packaged CLI smoke from a clean staged install directory, sanitized runtime
  environment, and (when requested) archived release assets with a stable inner
  executable basename
- release manifest, checksum, and legal-bundle checks

## Key commands

```bash
bun format
bun validate
bun test
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
bun run release:matrix
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
bun run release:manifest -- --tag vX.Y.Z --asset-dir ./dist/release-assets --notes-file ./dist/release-notes.md
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
```

## Related Docs

- [README.md](../README.md)
- [cli/README.md](../cli/README.md)
- [docs/004-2026-03-17-release-process.md](../docs/004-2026-03-17-release-process.md)
