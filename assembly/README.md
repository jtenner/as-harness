# Assembly Package

`assembly/` contains the guest-side AssemblyScript code for the harness. This code compiles into Wasm and runs inside a host runtime. It is intentionally separate from the host packages: guest code declares tests, manages guest-side runtime state, and emits normalized events, while host code owns instantiation, scheduling, decoding, and reporting.

## Scope

This package contains:

- guest-side runtime internals under `assembly/assembly/internal/`
- guest-visible entry points such as `assembly/assembly/exports.ts`
- package-style AssemblyScript `--lib` adapters such as `node:assert`, `node:assert/strict`, and the current `node:test` work
- internal AssemblyScript tests and smoke fixtures under `assembly/assembly/test/`

This package does not contain the `JS host` or `wazero host`. Those live under `harness/`.

## Current Status

Implemented today:

- Shared guest-to-host ABI imports such as `write_event` and `invoke_staged()`
- Guest-side event serialization, node metadata, traversal helpers, and trampoline support
- Working `node:assert` and `node:assert/strict` guest adapters
- An early but real `node:test` guest implementation with declaration, discovery, and targeted execution support
- Guest exports used by host runtimes, including `allocateNodeIndexBuffer`, `discover()`, `run()`, and `invoke()`
- AssemblyScript-side tests and smoke fixtures used by the root and host-package test flows

Still planned:

- Most non-Node framework adapters
- More host-facing replay validation and richer reporting behavior
- Async- or Promise-dependent assertion features that AssemblyScript cannot yet support well
- The remaining deeper `node:test` runner surface

## How It Relates To The CLI And Hosts

- The CLI consumes this package during compilation.
- `cli/as/generate-virtual-files.ts` snapshots `assembly/assembly/**/*.ts` so the CLI can bundle guest-side support files into a Bun executable.
- The `JS host` and `wazero host` instantiate Wasm modules produced from this package and listen for the serialized events it emits.

In short:

- `assembly/` defines the guest-side contract.
- `cli/` packages and compiles against that contract.
- `harness/js/` and `harness/wazero/` execute that contract.

## Guest-Side Support Code

Important directories:

- `assembly/assembly/internal/`
  Guest-side runtime internals such as event encoding, node metadata, traversal, execution helpers, hooks, reflected values, and the staged-callback trampoline.
- `assembly/assembly/node:assert/` and `assembly/assembly/node:test/`
  Guest-visible library entry points shaped like familiar Node APIs.
- `assembly/assembly/exports.ts`
  Explicit Wasm exports used by host runtimes.
- `assembly/assembly/test/`
  AssemblyScript-side tests and smoke fixtures.

## How It Is Consumed Today

During compilation:

- The CLI compiler wrapper can expose this package through bundled virtual files under `~/.as-harness`.
- Root and package-local test flows compile specific AssemblyScript fixtures with `asc`.

During testing:

- `bun test` at the repo root compiles and runs the AssemblyScript test entrypoint plus assertion smoke fixtures.
- `harness/js` and `harness/wazero` compile and load AssemblyScript smoke fixtures to verify host behavior.

## Commands

```bash
cd assembly
npm run asbuild
npm test
```

For the broader repo test flow, run `bun test` from the repository root.
