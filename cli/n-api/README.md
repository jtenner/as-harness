# CLI Native Addons

`cli/n-api/` is reserved for CLI-side native packaging work. Because the intended MVP includes the `wazero host`, this directory is the expected integration point for any `.node` `Node-API addon` packaging that the compiled CLI needs.

## Current Status

- This directory is currently a placeholder.
- The CLI does not yet load a native addon from here.
- No `target-specific native artifact` is currently checked in under this directory.

## Why This Directory Exists

The `wazero host` path cannot be treated like normal bundled JavaScript:

- it produces a `.node` `Node-API addon`
- that addon is target-specific
- a compiled `single-file Bun executable` would need a strategy for carrying, locating, or extracting the matching native binary

This directory exists so that packaging logic has a stable home once that work starts.

## Expected Artifact Shape

When this area becomes active, expect target-specific content such as:

- a `.node` addon for a specific platform and architecture
- metadata or loader code that chooses the correct addon for the current target
- any extraction or staging helpers needed by the compiled CLI

That work is still roadmap territory rather than a finished integration.
