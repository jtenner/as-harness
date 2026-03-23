# cli/transform

AssemblyScript AST transforms used by the CLI compiler wrapper.

Repository policy note as of 2026-03-23: public installation is npm-only, and the compiler path is consumed through `@as-harness/cli` with a consumer-installed `assemblyscript` peer rather than a separately published transform package.

## Purpose

The transform phase generates helper code for:

- strict structural equality
- reflected diagnostics for assertion failures

This supports `node:assert` and `node:assert/strict`.

## What it does

- walks parsed sources after non-library modules
- finds eligible managed classes
- injects generated `strictEqual` and reflected-value methods
- preserves generic context and inheritance behavior
- delegates heavy comparison work to shared runtime helpers

## Boundary

- **Transform owns**: class-shape inspection and code generation.
- **Guest runtime owns**: recursive comparison policy, collection handling, cycle tracking, and reflected value construction.

See [docs/002-2026-03-13-strict-equality-machinery.md](../../docs/002-2026-03-13-strict-equality-machinery.md).
