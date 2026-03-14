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

The current implementation now performs the first transform pass:

- it walks non-library parser sources after parse
- it recurses through nested namespaces
- it injects placeholder instance methods named
  `__asHarnessStrictEquals` and `__asHarnessAddReflectedValueKeyValuePairs`

Those generated methods are still contract scaffolds. They establish the
instrumentation path and method signatures before field/getter enumeration and
runtime delegation logic are added.
