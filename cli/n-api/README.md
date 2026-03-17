# CLI Native Addons

`cli/n-api/` is the CLI-side staging area for target-specific native packaging work. Because the intended MVP includes the `wazero host`, this directory is the integration point for any `.node` `Node-API addon` packaging that the compiled CLI needs.

## Current Status

- `build.ts` can now stage a target-matched local `wazero` addon here before compiling a Bun executable.
- Generated `.node` artifacts remain ignored and are not checked in.
- The standalone compiled CLI can now run through `wazero` when the matching addon is staged for the build target, but cross-target release proof is still incomplete.

## Why This Directory Exists

The `wazero host` path cannot be treated like normal bundled JavaScript:

- it produces a `.node` `Node-API addon`
- that addon is target-specific
- a compiled `single-file Bun executable` would need a strategy for carrying, locating, or extracting the matching native binary

This directory now gives the packaging logic a stable home while keeping generated native artifacts out of git.

## Expected Artifact Shape

When this area becomes active, expect target-specific content such as:

- a `.node` addon for a specific platform and architecture
- metadata or loader code that chooses the correct addon for the current target
- any extraction or staging helpers needed by the compiled CLI

That work is now active for the local packaged path, but it is not yet a finished cross-target release integration.
