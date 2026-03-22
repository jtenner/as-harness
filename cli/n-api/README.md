# CLI Native Addons

`cli/n-api/` stages target-specific native `.node` artifacts used by packaged builds.

## Why

- `wazero` requires a host-specific native addon for packaged CLI execution.
- `wasmtime` remains source-only for now, so it does not use this staging path.

## Behavior

- `cli/build.ts` builds and stages the matching wazero artifact for the current machine.
- release builds resolve staged artifacts from this directory before Bun bundles the matching native addon into the packaged executable.
- generated `.node` files are ignored from VCS.

## Limits

- local build is limited to artifacts for the current machine.
- cross-target native artifacts are sourced from release matrix outputs.
- Linux musl is intentionally out of scope.
