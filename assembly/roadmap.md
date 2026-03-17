# Assembly Roadmap

This roadmap tracks adapter-level intent for the guest package.

## Current Priorities

- keep the synchronous `node:test` core stable
- keep `node:assert` and `node:assert/strict` aligned with the current release scope
- finish the remaining Wasm-runtime and host-boundary notes needed for shipping
- document the ABI clearly enough that additional host implementations can target it

## Current Scope Limits

The project still treats these as out of scope until AssemblyScript gains better language support:

- mock and spy APIs that rely on closures or call recording
- Promise-based test helpers and async assertion helpers
- matcher-heavy assertion surfaces that need richer runtime object modeling

## Adapter Intent

Tracked adapters:

- `node:test`
- `node:assert`
- `jest`
- `vitest`
- `mocha`
- `ava`
- `tap`
- `tape`
- `uvu`
- `jasmine`
- `qunit`

Only the Node-shaped adapters are currently active implementation work.

## How To Read The Adapter TODO Pages

Each adapter TODO page should answer:

- what part of the public declaration surface matters
- what current non-goals apply
- what the first minimal fixture should prove

All adapter work still has to lower into the same guest runtime and the same host ABI described in [docs/harness-abi.md](/home/jtenner/Projects/as-harness/docs/harness-abi.md).
