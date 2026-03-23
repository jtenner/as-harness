# Release Process

Operational flow for shipping `as-harness` through GitHub:

1. run local validation
2. push to GitHub
3. let CI run source-host checks
4. tag `vX.Y.Z`
5. let the release workflow verify and publish npm packages

## Current policy

- npm is the only public installable distribution route
- the tag workflow now stages, verifies, packs, and publishes the lockstep npm
  package set after cross-platform host verification and clean install smoke,
  then creates or updates a notes-only GitHub release page from the annotated
  tag contents
- while the project is still `0.x`, treat a `minor` bump as the normal vehicle
  for breaking public API or behavior changes; reserve `patch` for
  non-breaking fixes within the current minor line
- the staged npm package lane includes `@as-harness/wasmtime`
- `@as-harness/cli` expects a consumer-installed `assemblyscript` peer
- CI and release install toolchains from repo-local [`.mise.toml`](../.mise.toml)
  through `jdx/mise-action@v4`
- Node.js `25.8.1` baseline
- Bun `1.3.11` baseline for repo automation
- Go `1.26.1` baseline for `wazero` source verification and native package production
- Rust `1.94.0` baseline for `wasmtime` source verification and native package production

## Targets

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
bun run npm:stage
bun run npm:verify
bun run npm:install-smoke
```
Source-host verification proof is intentionally different from npm package
proof:

- `verify:source-hosts` builds a Node-targeted CLI bundle and runs that bundle
  under the configured Node baseline so native source hosts are exercised
  without depending on Bun's direct Windows native-addon path
- `npm:verify` inspects the staged npm package payloads with
  `npm pack --dry-run --json`
- `npm:install-smoke` installs the staged tarballs into clean temp projects and
  proves the staged CLI and runtime packages under Node for all staged
  runtimes, Bun for the JS harness, and the consumer-installed
  `assemblyscript` peer contract
- `npm:pack-release` creates publishable tarballs from the staged package set,
  and `npm:publish-release` publishes the collected cross-platform tarballs in
  dependency order

Inspect source-host lists locally:

```bash
mise trust
mise install
bun run host:matrix
bun run verify:source-hosts -- --target linux-x64 --report-dir ./dist/source-host-reports
```

## CI expectations

- repo validation
- root Bun tests
- full source-host matrix through the Node-targeted source CLI bundle
- staged npm pack validation and clean temp-project npm install smoke now run on
  the release host matrix before the workflow publishes npm packages in
  dependency order
- notes-only GitHub release creation from the annotated tag contents after npm
  publication succeeds

## Tagging

Release workflows trigger on `v*` tags.
Tag must match `cli/package.json` version.

Pre-`v1` release semantics:

- `patch`: non-breaking fixes within the current `0.x` minor line
- `minor`: the expected pre-`v1` breaking-release lane
- `major`: reserve for the eventual `1.0.0` stabilization line or a deliberate
  post-`v1` semver major

## Failure triage

- npm publish failure: inspect the staged package reports and the registry
  authentication setup first
- GitHub release page failure: confirm the pushed tag is annotated and carries
  the intended summary text
- source-host smoke failure on Windows: confirm the generated Node-targeted CLI
  bundle path and `AS_HARNESS_SOURCE_CLI_REPO_DIR` wiring before blaming the
  native host package
- non-matching tag/version: align `cli/package.json` and tag

## Non-goals

- no standalone packaged Bun executable publication
- no scope change without explicit matrix/provenance updates

## Related files

- `.github/workflows/release.yml`
- `scripts/stage-npm-packages.ts`
- `scripts/pack-npm-packages.ts`
- `scripts/publish-npm-packages.ts`
- `scripts/verify-npm-packages.ts`
- `scripts/verify-npm-install-smoke.ts`
- `scripts/host-validation-matrix.ts`
- `docs/007-2026-03-17-host-runner-contract.md`
