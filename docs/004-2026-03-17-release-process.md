# Release Process

Operational flow for shipping `as-harness` through GitHub:

1. run local validation
2. push to GitHub
3. let CI run source-host checks
4. tag `vX.Y.Z`
5. let release workflow build, verify, and publish artifacts

## Current policy

- official packaged Bun releases are currently gated pending a documented Bun
  standalone redistribution path
- source and verification tooling still build packaged Bun executables locally
  for engineering proof
- the tag workflow now stages, verifies, packs, and publishes the lockstep npm
  package set after cross-platform host verification and clean install smoke
- while the project is still `0.x`, treat a `minor` bump as the normal vehicle
  for breaking public API or behavior changes; reserve `patch` for
  non-breaking fixes within the current minor line
- packaged targets include `js` everywhere and `wazero` on `bun-darwin-arm64`,
  `bun-darwin-x64`, and `bun-linux-x64`; `bun-linux-arm64` and
  `bun-windows-x64` stay `js`-only
- release packaging ships target-specific archives that preserve the inner
  executable basename while keeping `wazero` bundled inside the executable
- packaged release assets stay archived instead of renaming the executable itself because current Bun standalone native-addon loading is sensitive to the compiled executable basename on Linux
- packaged Linux `wazero` stays on the interpreter engine as the deliberate
  stability policy for this release line
- each packaged release archive now includes a `legal/` directory with the
  project `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the tracked third-party
  license texts for the packaged release line
- packaged Bun release assets exclude `wasmtime`, while the staged npm package
  lane includes `@as-harness/wasmtime`
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
bun run npm:stage
bun run npm:verify
bun run npm:install-smoke
AS_HARNESS_ALLOW_UNRESOLVED_BUN_STANDALONE_RELEASE=1 bun run assert:bun-release-policy
bun run release:matrix
bun run verify:packaged-cli -- --target bun-linux-x64 --report-dir ./dist/packaged-cli-reports
```

The release workflow intentionally fails closed on tag pushes until the Bun
standalone redistribution path is implemented. The temporary
`AS_HARNESS_ALLOW_UNRESOLVED_BUN_STANDALONE_RELEASE=1` override exists only for
explicitly acknowledged non-public or otherwise accepted override runs.

Source-host verification proof is intentionally different from packaged proof:

- `verify:source-hosts` builds a Node-targeted CLI bundle and runs that bundle
  under the configured Node baseline so native source hosts are exercised
  without depending on Bun's direct Windows native-addon path
- `verify:packaged-cli` stages the real packaged Bun executable from the
  release archive under a sanitized runtime environment and verifies the
  bundled hosts from that clean install shape; the archived install shape now
  includes the packaged `legal/` bundle alongside the executable
- `npm:verify` inspects the staged npm package payloads with
  `npm pack --dry-run --json`
- `npm:install-smoke` installs the staged tarballs into clean temp projects and
  proves the staged CLI and runtime packages under both Node and Bun
- `npm:pack-release` creates publishable tarballs from the staged package set,
  and `npm:publish-release` publishes the collected cross-platform tarballs in
  dependency order

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
- staged npm pack validation and clean temp-project npm install smoke now run on
  the release host matrix before the workflow publishes npm packages in
  dependency order
- tag-driven public packaged release publication stays blocked by the Bun
  standalone release-policy gate unless an explicit override is configured

## Tagging

Release workflows trigger on `v*` tags.
Tag must match `cli/package.json` version.

Pre-`v1` release semantics:

- `patch`: non-breaking fixes within the current `0.x` minor line
- `minor`: the expected pre-`v1` breaking-release lane
- `major`: reserve for the eventual `1.0.0` stabilization line or a deliberate
  post-`v1` semver major

## Failure triage

- release-policy failure: treat this as the expected Bun-redistribution gate,
  not as a build failure
- release build failure: inspect target packaged smoke step
- verifier-wrapper failure: check wrapper logs first
- packaged build timeout: treat as build-budget exhaustion before blaming hosted verifier supervision
- packaged smoke timeout: treat as likely host hang before blaming the package itself
- source-host smoke failure on Windows: confirm the generated Node-targeted CLI
  bundle path and `AS_HARNESS_SOURCE_CLI_REPO_DIR` wiring before blaming the
  native host package
- non-matching tag/version: align `cli/package.json` and tag

## Non-goals

- no packaged `wasmtime`
- no scope change without explicit matrix/provenance updates

## Related files

- `.github/workflows/release.yml`
- `scripts/release-manifest.ts`
- `scripts/verify-packaged-cli.ts`
- `scripts/stage-npm-packages.ts`
- `scripts/pack-npm-packages.ts`
- `scripts/publish-npm-packages.ts`
- `scripts/verify-npm-packages.ts`
- `scripts/verify-npm-install-smoke.ts`
- `scripts/release-matrix.ts`
- `scripts/stage-release-legal.ts`
- `scripts/host-validation-matrix.ts`
- `cli/build-targets.ts`
- `docs/007-2026-03-17-host-runner-contract.md`
