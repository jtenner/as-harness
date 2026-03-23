# Scripts

`scripts/` contains repo-level helper scripts for validation, smoke proof, and release workflow.

## Script Map

- `format.ts` — run Biome, `gofmt`, and `cargo fmt`.
- `validate.ts` — check format baseline and run CLI lints.
- `check-legal.ts` — verify the checked-in generated legal artifacts still
  match the public npm legal metadata and `wasmtime` cargo metadata.
- `sync-third-party-notices.ts` — regenerate `THIRD_PARTY_NOTICES.md` from the
  public npm dependency metadata.
- `test.ts` — repo test flow including AssemblyScript smoke + host package tests (`js`, `wazero`, `wasmtime`).
- `test-bootstrap.ts` — run the compiled AssemblyScript bootstrap fixture.
- `assert-bridge-smoke.ts` — verify assertion bridge behavior through compiled fixtures.
- `generate-wasmtime-license-inventory.ts` — regenerate the source-build
  `wasmtime` third-party inventory from `cargo metadata --format-version 1 --locked`.
- `host-validation-matrix.ts` — emit the source-host matrix.
- `source-host-smoke.ts` — shared source-host smoke command map used by repo and matrix test flows.
- `verify-source-hosts.ts` — execute source-host package smoke commands for a
  matrix target and emit source-host reports; native host smoke inside those
  package tests builds a Node-targeted CLI bundle.
- `stage-npm-packages.ts` — stage the current npm package set into `dist/npm`
  with package-safe shared/native runtime boundaries and an `assemblyscript`
  peer dependency for the CLI package.
- `verify-npm-packages.ts` — run `npm pack --dry-run --json` against the staged
  npm package set and emit package payload reports.
- `verify-npm-install-smoke.ts` — install the staged package tarballs into clean
  temp projects, smoke the CLI under Node for all staged runtimes plus Bun for
  the JS harness, prove the local `assemblyscript` peer path, and prove
  missing peer/native packages fail clearly.
- `pack-npm-packages.ts` — stage and pack release npm tarballs, writing an
  artifact manifest for the publish step.
- `publish-npm-packages.ts` — publish the collected cross-platform npm tarballs
  in dependency order. In CI, npm trusted publishing is expected to provide the
  authentication through GitHub Actions OIDC rather than a long-lived npm
  secret.

## What These Scripts Prove

- formatting and CLI lint baseline
- generated npm/source legal inventory drift checks
- guest compile flow
- assertion bridge parity
- shared host smoke suites for all shipped hosts
- source-host matrix execution with persisted reports and a Bun-built
  Node-targeted CLI bundle for native-host smoke
- staged npm package payload shape plus `npm pack --dry-run` publish proof for
  the current shared, JS, and native runtime package slices
- clean temp-project install smoke for the staged npm package set plus explicit
  missing-peer and missing-native-package failure proof; Bun install smoke stays
  on the JS harness while native Bun coverage remains package-local
- cross-platform npm release tarball packing and ordered publication from the
  tag workflow

## Key commands

```bash
bun format
bun validate
bun run legal:check
bun run legal:sync:notices
bun run legal:sync:wasmtime
bun run npm:pack-release
bun run npm:publish-release -- --dry-run --allow-missing-packages
bun run npm:stage
bun run npm:verify
bun run npm:install-smoke
bun test
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
cd harness/js && npm test
cd harness/wazero && npm test
cd harness/wasmtime && npm test
```

## Related Docs

- [README.md](../README.md)
- [cli/README.md](../cli/README.md)
- [docs/004-2026-03-17-release-process.md](../docs/004-2026-03-17-release-process.md)
