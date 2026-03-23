# Dual-Channel Npm Release Contract

This document answers: what package contract should `as-harness` use for the
planned dual GitHub-release plus npm-release model? The recommendation is:
publish a lockstep npm package set where each runtime unit is its own package,
use `optionalDependencies` plus per-platform native binary packages for
`wazero` and `wasmtime`, keep packaged Bun executables on GitHub releases, and
keep `assembly/` internal instead of publishing it as a separate npm package.
This affects package metadata, `dist/npm` staging, release automation, runtime
import boundaries, and npm smoke verification.

This contract records the repo decision as of `2026-03-23`.

## Decision Summary

- npm publication is a first-class distribution channel alongside GitHub
  packaged executable releases
- every publishable runtime unit gets its own package boundary
- package versions stay lockstep across the public npm package set
- native npm distribution uses meta packages with `optionalDependencies` on
  per-platform binary packages rather than source-build installs
- GitHub releases continue to own the packaged Bun executable archives,
  checksums, release notes, and legal sidecar assets
- npm continues to exclude the packaged Bun executable lane until the Bun
  redistribution/compliance work is complete
- `assembly/` stays internal and is not part of the public npm package set

## Lockstep Public Package Set

Initial public npm package set:

- `@as-harness/shared`
- `@as-harness/js`
- `@as-harness/wazero`
- `@as-harness/wasmtime`
- `@as-harness/cli`

Native platform binary packages:

- `@as-harness/wazero-darwin-arm64`
- `@as-harness/wazero-darwin-x64`
- `@as-harness/wazero-linux-arm64-gnu`
- `@as-harness/wazero-linux-x64-gnu`
- `@as-harness/wazero-win32-x64-msvc`
- `@as-harness/wasmtime-darwin-arm64`
- `@as-harness/wasmtime-darwin-x64`
- `@as-harness/wasmtime-linux-arm64-gnu`
- `@as-harness/wasmtime-linux-x64-gnu`
- `@as-harness/wasmtime-win32-x64-msvc`

Internal-only package scope:

- `assembly/` stays outside the public npm set because it is effectively
  required with the main harness flow and does not provide useful standalone
  value on its own

## Package Roles

`@as-harness/shared`

- owns the shared host-runtime substrate currently living in `harness/shared/`
- exports shared `Harness` types, coverage helpers, snapshot helpers, and the
  shared `start()` orchestration entrypoints
- is a direct dependency of `@as-harness/js`, `@as-harness/wazero`, and
  `@as-harness/wasmtime`

`@as-harness/js`

- ships the portable JavaScript runtime host
- depends on `@as-harness/shared`
- has no native binary payload

`@as-harness/wazero` and `@as-harness/wasmtime`

- ship the stable host-facing JS entrypoint and runtime package metadata
- depend on `@as-harness/shared`
- resolve one installed per-platform binary package through
  `optionalDependencies`
- must fail clearly on unsupported platforms instead of falling back to
  repo-local build output

`@as-harness/cli`

- ships the installable JS CLI entrypoint for Node and Bun
- depends on `@as-harness/js`
- treats `@as-harness/wazero` and `@as-harness/wasmtime` as optional runtime
  dependencies rather than bundling repo-local host paths
- does not own the packaged Bun executable artifacts

## Baselines

Current release and verification baselines remain the package contract
baselines until a later doc supersedes them:

- Node.js `25.8.1`
- Bun `1.3.11`
- Go `1.26.1` for `wazero` source verification and native package production
- Rust `1.94.0` for `wasmtime` source verification and native package
  production

npm smoke and publish validation must prove the staged package set under both
Node and Bun on those baselines.

## Native Target Contract

The initial supported native npm target set matches the current source-host
verification matrix:

- `darwin-arm64`
- `darwin-x64`
- `linux-arm64-gnu`
- `linux-x64-gnu`
- `win32-x64-msvc`

Deliberate exclusions for the first npm phase:

- Linux musl
- Windows arm64
- x86

Those exclusions must be reflected in package names, `os` / `cpu` / `libc`
metadata where applicable, and unsupported-platform smoke coverage.

## Publish Order

The dependency order for npm publication is:

1. `@as-harness/shared`
2. `@as-harness/js`
3. all `@as-harness/wazero-*` binary packages
4. `@as-harness/wazero`
5. all `@as-harness/wasmtime-*` binary packages
6. `@as-harness/wasmtime`
7. `@as-harness/cli`

The publish workflow must stop before `@as-harness/cli` if any upstream package
fails staging, smoke, pack validation, or publication.

## Artifact Ownership

GitHub releases own:

- packaged Bun executable archives
- packaged CLI verification reports
- release manifest, checksums, and release notes
- bundled executable legal sidecar assets

npm owns:

- package tarballs for the public package set
- Node/Bun installable runtime entrypoints
- per-platform native binary tarballs

The same repo version bump drives both lanes, but the packaged Bun executable
lane remains gated independently by Bun redistribution compliance.

## Rejected Model

Source-build npm installs are rejected for the initial public release model.

Reasons:

- they would force end users to provision Go or Rust toolchains during normal
  package installation
- they would blur the line between supported runtime targets and incidental
  developer build environments
- they would complicate reproducible publish validation and unsupported-platform
  failure semantics

## Immediate Repo Implications

- `harness/shared/` needs a staged package boundary
- `dist/npm/` becomes the canonical staging root for npm payloads
- CLI and runtime import paths need staged package-name-based resolution instead
  of repo-relative host paths
- release automation must publish npm packages in dependency order without
  changing ownership of the GitHub packaged executable artifacts

## Related Files

- [agent-todo.md](../agent-todo.md)
- [docs/004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md)
- [cli/runtime/js.ts](../cli/runtime/js.ts)
- [cli/runtime/wazero.ts](../cli/runtime/wazero.ts)
- [cli/runtime/wasmtime.ts](../cli/runtime/wasmtime.ts)
- [harness/shared/start.cjs](../harness/shared/start.cjs)
