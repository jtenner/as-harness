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
- it injects instance methods named
  `__asHarnessStrictEquals` and `__asHarnessAddReflectedValueKeyValuePairs`
- it selects participating instance members from class fields and getters while
  excluding static members, setters, constructors, and regular methods
- it preserves class generic context while adding those hooks
- it emits same-instance and runtime-type guards before generated comparison
  work begins
- it emits inheritance-aware bodies that delegate into `super` when a class
  extends a base class
- it emits per-member helper calls so selected fields and getters flow into the
  shared strict-equality and reflected-value runtimes

Those generated methods are still scaffold-level at the runtime boundary. The
shared AssemblyScript helpers now perform primitive, string, nullable,
runtime-type, `ArrayBuffer`, and managed-class recursive checks. Arrays, typed
arrays, sets, and maps are still pending.
