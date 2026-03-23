# Harness Todo

## v0.6.0

### Blockers

- lock the dual-channel release contract for GitHub binaries plus npm packages
  before changing package metadata or workflows.
- choose the native npm distribution model (`optionalDependencies` meta package
  plus per-platform binary packages vs source-build installs) before publishing
  `wazero` or `wasmtime`.
- resolve the Bun standalone redistribution/compliance path before treating the
  packaged executable release lane as legally complete.

### Risks

- the current CLI package is Bun-first and repo-relative, so publishing it
  before staging a Node-safe package shape would ship a broken npm CLI.
- native runtime packages currently load local `dist/*.node` outputs and shared
  repo files directly, so staged package layouts must prove clean install/load
  paths under both Node and Bun before release automation goes live.

### Release Contract

- `pkg-001` Document the lockstep package set, supported Node/Bun baselines,
  supported native targets, package names, publish order, and artifact
  ownership for the dual GitHub-release plus npm-release model.

### Shared Packaging Substrate

- `pkg-002` Extract or stage the shared host-runtime support files so published
  packages no longer depend on repo-relative `harness/shared/*` paths.
- `pkg-003` Add a repo-level staging pipeline that writes all npm package
  outputs to `dist/npm/*` and keeps GitHub release assets in
  `dist/release-assets/*` from the same release input.

### Runtime Packages

- `pkg-004` Make `@as-harness/js` a real published package with explicit
  exports, files, types, legal files, and clean-install smoke proof in Node and
  Bun.
- `pkg-005` Define and stage per-platform native binary packages for
  `@as-harness/wazero` and `@as-harness/wasmtime`.
- `pkg-006` Convert `@as-harness/wazero` into a published meta package that
  resolves the installed platform binary package instead of repo-local build
  output.
- `pkg-007` Convert `@as-harness/wasmtime` into a published meta package that
  resolves the installed platform binary package instead of repo-local build
  output.

### CLI Package

- `pkg-008` Replace repo-relative runtime imports in `@as-harness/cli` with
  package imports and stage a published JS CLI entrypoint that works under Node
  and Bun.
- `pkg-009` Decide whether `assembly/` ships as a public package, and if so add
  the missing package identity/version metadata plus release proof after the
  runtime and CLI package shapes are stable.

### Verification And Release Automation

- `pkg-010` Add clean temp-project install and smoke coverage for every staged
  npm package under Node and Bun, including explicit unsupported-platform
  failure proof for native packages.
- `pkg-011` Extend the tag-driven release workflow to stage, verify, and
  publish npm packages in dependency order while keeping the existing packaged
  Bun executable release assets.

### Docs

- `pkg-012` Refresh the root/package READMEs and release-process docs to
  replace the current GitHub-only distribution guidance with the staged
  dual-channel release contract.

### Legal And Compliance

- `legal-003` Replace the temporary Bun standalone release gate with a
  documented redistribution path that satisfies Bun's official downstream
  guidance for standalone executables.
