# Primary Buildout

This document explains the intended split between guest runtime work and host harness work.

For the concrete host boundary, use [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md). This document is the architectural view above that ABI.

## Core Principle

The guest emits execution facts.

The host owns orchestration.

That means:

- guest code declares tests, traverses nodes, executes callbacks, and emits normalized events
- host code instantiates Wasm, stages `NodeIndex` values, decodes events, schedules work, and reports outcomes

## System Split

### Guest Runtime

Location:

- `assembly/assembly/internal/`
- `assembly/assembly/exports.ts`
- guest adapter folders such as `node:test` and `node:assert`

Responsibilities:

- internal declaration primitives
- node registration
- deterministic `NodeIndex` derivation
- traversal and rediscovery
- callback and lifecycle execution
- event encoding
- the flat Wasm import/export boundary

### Host Harness

Location:

- `harness/js`
- `harness/wazero`
- future third-party hosts that implement the same ABI

Responsibilities:

- compile or instantiate the module
- call `__start`
- stage `NodeIndex` values
- implement trap observation
- decode events
- maintain execution aggregates
- expose the host API expected by the CLI

## Guest Runtime Areas

The guest buildout still groups naturally into these areas:

- declaration APIs and adapter entry points
- node registration and structural discovery
- targeted traversal and replay
- execution and lifecycle ordering
- assertion bridge integration
- event encoding
- flat imported/exported ABI
- attempt-local execution state

## Host Buildout Areas

The host side still needs to stay aligned on:

- event decoding
- `callI32(exportName)`
- `discover(nodeIndex)`
- `run(nodeIndex)`
- `start()` aggregation
- trap observation through the trampoline path

The repo now has shared smoke coverage for those parity areas, but the host boundary still needs clearer standalone implementer guidance and broader release proof.

## Recommended Reading Order

1. [README.md](/home/jtenner/Projects/as-harness/README.md)
2. [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md)
3. [assembly/README.md](/home/jtenner/Projects/as-harness/assembly/README.md)
4. [agent-todo.md](/home/jtenner/Projects/as-harness/agent-todo.md)
