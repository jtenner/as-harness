# `cli/transform`

This folder scaffolds the future AssemblyScript AST transform used to inject the
strict-equality and reflected-diagnostics hooks required by `node:assert`
support.

The transform is expected to:

- traverse parsed AssemblyScript sources after parse
- recurse into namespaces
- find class declarations
- inject generated instance methods for structural comparison
- inject generated instance methods for reflected key/value extraction

Implementation planning lives in
[strict-equality-machinery.md](/home/jtenner/Projects/as-harness/docs/strict-equality-machinery.md).

The files under `src/` are placeholders only. They exist to establish the
intended module layout before implementation begins.
