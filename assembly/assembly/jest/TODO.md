# `jest` Adapter TODO

Status:

- planned
- not in `v0.1.0`

First implementation slice:

- map `test`, `describe`, `skip`, `todo`, and core lifecycle hooks
- keep Jest-specific overloads inside this folder
- add one minimal traversal fixture

Current non-goals:

- mocks, spies, and call-tracking helpers
- Promise-based matchers such as `.resolves` and `.rejects`
