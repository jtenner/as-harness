# `vitest` Adapter TODO

Status:

- first implementation slice implemented
- not in `v0.1.0`
- current supported surface documented in [docs/Vitest.md](../../../docs/Vitest.md)

First implementation slice:

- [x] map `test`, `it`, `describe`, `suite`, `skip`, `todo`, and core lifecycle hooks
- [x] add `fails`, `skipIf`, `runIf`, and `assertType(...)`
- [x] add low-risk `sequential` aliases for the current always-sequential runner
- [x] reuse the shipped Jest matcher subset for `expect(...)`
- [x] keep Vitest-specific naming in this folder
- [x] add guest smoke coverage and a bundled CLI smoke path

Current non-goals:

- mocks, spies, and call-tracking matchers
- fixture extension and `vi`
- Promise-based matchers such as `.resolves` and `.rejects`
- snapshots, `expectTypeOf`, `bench`, and async helpers
