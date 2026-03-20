# Primary Buildout

This is the guest/runtime versus host split for `as-harness`.

## Core Principle

- guest: declare, traverse, execute callbacks, emit normalized events
- host: instantiate, schedule, aggregate, report

## Split

### Guest Runtime

- `assembly/assembly/internal/`
- `assembly/assembly/exports.ts`
- `assembly/assembly/{node:test,jest,vitest,node_assert}/`

Owns declaration registration, deterministic `NodeIndex` derivation, traversal/replay, callback execution, event encoding.

### Host Harness

- `harness/js`, `harness/wazero`, `harness/wasmtime`
- future third-party hosts implementing the same ABI

Owns compilation, imports/exports, staged `NodeIndex` handling, trap observation, decoding, scheduling, and reporting.

## Areas to know

### Guest
- declaration APIs and adapter entry points
- registration and structural discovery
- targeted replay
- execution + lifecycle
- assertion bridge and ABI surface

### Host
- event decoding
- `callI32(exportName)`
- `discover(nodeIndex)` / `run(nodeIndex)`
- `start()` orchestration
- trap observation

## Recommended reading order

1. [README.md](../README.md)
2. [docs/003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md)
3. [docs/006-2026-03-17-guest-runtime-contracts.md](./006-2026-03-17-guest-runtime-contracts.md)
4. [assembly/README.md](../assembly/README.md)
5. [agent-todo.md](../agent-todo.md)
