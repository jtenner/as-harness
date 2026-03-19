# Strict Equality Machinery

This document describes the current design for structural equality and reflected diagnostics in the guest runtime.

## Goal

Support `node:assert` and `node:assert/strict` features that need:

- structural comparison
- reflected value extraction
- guest-owned failure context

without depending on unsupported runtime reflection in AssemblyScript.

## Split

There are two cooperating layers.

### CLI Transform Layer

Location:

- `cli/transform/`

Responsibilities:

- inspect class declarations
- generate strict-equality hooks
- generate reflected-diagnostics hooks
- preserve generic context and inheritance shape

### Guest Runtime Layer

Location:

- `assembly/assembly/internal/`

Responsibilities:

- recursive comparison
- cycle tracking
- collection-aware comparison
- reflected-value construction
- delegation into generated class hooks

## Why The Split Exists

The transform knows class shape.

The guest runtime knows comparison policy.

Without the transform, class fields and getters cannot be enumerated reliably.

Without the runtime, every class would need to duplicate collection and recursion policy.

## Current State

Implemented today:

- a first transform pass for managed classes
- generated strict-equality and reflected-diagnostics methods
- inheritance-aware generated bodies
- guest runtime helpers for primitives, strings, buffers, arrays, typed arrays, `Set`, `Map`, and managed-class recursion
- guest-owned stack-trace direction for reflected diagnostics

Still open:

- fuller fixture coverage across value categories
- more protocol notes for how stack traces and reflected values move across the host boundary
- deeper assertion-level integration beyond the current first scope

## Current Policy Decisions

- the first shared structural-comparison core targets strict semantics
- test authors own deep-equality failure message text
- default reporting stays minimal and reports shape mismatch rather than synthesizing richer host text
- guest code owns stack-trace construction; hosts should not infer guest frame structure

## Related Docs

- Transform overview: [cli/transform/README.md](../cli/transform/README.md)
- Guest architecture: [docs/001-2026-03-13-primary-buildout.md](./001-2026-03-13-primary-buildout.md)
- Host ABI: [docs/003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md)
