# `ava` Adapter TODO

Status:

- planned
- not in `v0.1.0`

First implementation slice:

- define the smallest declaration surface worth supporting
- map that surface onto the shared guest runtime
- add one minimal traversal fixture

Constraints:

- must lower into the same guest runtime and host ABI as the shipped adapters
- async-heavy AVA behavior is deferred until AssemblyScript has stronger Promise support
