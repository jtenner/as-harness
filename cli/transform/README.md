# `cli/transform`

`cli/transform` contains the AssemblyScript AST transform support used by the CLI compiler wrapper.

## Current Purpose

Today this folder exists to support:

- strict structural comparison hooks
- reflected-diagnostics hooks

That work is primarily consumed by the `node:assert` and `node:assert/strict` guest libraries.

## What The Transform Does

The current transform pass:

- walks non-library parser sources after parse
- recurses into namespaces
- finds eligible managed classes
- injects generated instance methods for strict equality and reflected diagnostics
- preserves generic context and inheritance behavior
- delegates actual comparison and reflected-value logic back into the shared guest runtime

## Boundaries

The transform owns compile-time class-shape knowledge.

The guest runtime owns:

- recursive comparison semantics
- collection semantics
- cycle handling
- reflected-value construction

That split is documented in [docs/002-2026-03-13-strict-equality-machinery.md](../../docs/002-2026-03-13-strict-equality-machinery.md).

## Related Docs

- Strict equality design: [docs/002-2026-03-13-strict-equality-machinery.md](../../docs/002-2026-03-13-strict-equality-machinery.md)
- CLI overview: [cli/README.md](../README.md)
