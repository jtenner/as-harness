# `mocha` Adapter TODO

Status:

- planned
- not in `v0.1.0`

First implementation slice:

- map `describe`, `it`, skip/todo variants, and lifecycle hooks
- keep Mocha-specific surface details in this folder
- add one minimal traversal fixture

Constraints:

- the adapter still needs to lower into the shared runtime and shared harness ABI
