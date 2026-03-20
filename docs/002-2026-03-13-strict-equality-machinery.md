# Strict Equality Machinery

This document defines how `node:assert` gets structural comparison without overreaching AssemblyScript reflection.

## Goal

Support strict-style assertion APIs with:

- structural comparison
- reflected values in failures
- guest-owned failure context

without full runtime reflection.

## Split

### CLI Transform

- scans classes
- generates strict-equality + reflected-value hooks
- preserves generic/inheritance context

### Guest Runtime

- recursive comparison and cycle handling
- collection-aware comparison
- reflected-value construction
- delegates into generated hooks

## Why split

The transform knows class shape.
The runtime owns comparison policy and recursion behavior.

## State

Implemented:

- first class transform pass
- generated strict-equality + reflected diagnostics methods
- helper support for primitives, strings, buffers/arrays, `Set`/`Map`, and class recursion
- reflected failure stack-trace direction

Open:

- fuller fixture coverage
- richer protocol notes for stack-trace/reflection boundaries
- deeper assertion-level integration

## Current policy

- strict semantics for shared comparison core
- stable, minimal failure message surface
- assertions own message text
- stack traces remain guest-constructed; hosts do not infer guest structure

## Related

- [cli/transform/README.md](../cli/transform/README.md)
- [docs/001-2026-03-13-primary-buildout.md](./001-2026-03-13-primary-buildout.md)
- [docs/003-2026-03-17-harness-abi.md](./003-2026-03-17-harness-abi.md)
