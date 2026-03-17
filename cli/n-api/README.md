# CLI Native Addons

`cli/n-api/` is the staging area for native addons that the packaged CLI needs at runtime.

## Why This Exists

The `wazero` host is not just JavaScript. It requires a target-specific `.node` file, which means the packaged CLI needs a predictable place to stage and resolve that artifact during builds.

## Current Behavior

- `cli/build.ts` stages a target-matched local wazero addon here when the current machine can build it
- packaged release-target executables resolve the staged addon through build-time-defined constants
- generated `.node` files are ignored and not checked into git

## Current Limits

- only the current machine’s matching addon can be built locally by default
- cross-target packaged addons still depend on the GitHub-hosted release matrix producing the non-local target artifacts
- Linux `musl` is intentionally excluded from the first release scope

The hosted matrix is now the canonical way the release gathers the packaged target set into one GitHub release.

## Related Docs

- Repo overview: [README.md](../../README.md)
- CLI packaging docs: [cli/README.md](../README.md)
- Harness ABI: [docs/harness-abi.md](../../docs/harness-abi.md)
- wazero host package: [harness/wazero/README.md](../../harness/wazero/README.md)
