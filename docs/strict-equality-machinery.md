# Strict Equality Machinery

This document records the implementation plan for structural equality and
reflected diagnostics support needed by `node:assert` APIs such as
`deepEqual(...)`.

The immediate goal is not to implement a full assertion surface. The goal is to
build the machinery that makes it possible to compare AssemblyScript values,
including managed classes, without relying on unsupported runtime reflection.

## Problem

AssemblyScript does not provide an easy runtime mechanism to inspect arbitrary
class shape and compare fields generically.

That means a Node-like deep-equality API cannot be implemented as a single
"accept any value and walk it dynamically" function for managed classes.

For strict or deep structural comparison of classes, the runtime needs
class-specific knowledge of:

- which instance fields participate
- which getters participate
- how inheritance affects the member list
- how recursive comparison is delegated back into shared machinery

The clean way to supply that information is a compiler-side transform that
injects generated methods into class declarations after parse.

## Architectural Split

The design is split into two cooperating layers.

### 1. CLI Transform Layer

Location: `cli/transform/`

Responsibilities:

- walk parsed AssemblyScript sources
- recurse through namespaces
- find class declarations
- inject generated instance methods for:
- structural comparison
- reflected key/value extraction
- preserve generic context
- preserve inheritance semantics

This layer should know the class AST shape, but it should not own recursive
comparison policy for arrays, maps, sets, or cycles.

### 2. Assembly Runtime Layer

Location: `assembly/assembly/internal/`

Responsibilities:

- implement the shared structural equality engine
- implement cycle detection / defer semantics
- implement specialized branches for:
- primitives
- strings
- `ArrayBuffer`
- arrays / arraylikes
- typed arrays
- `Set`
- `Map`
- function references
- call into transform-generated class comparison hooks
- implement reflected-value construction for diagnostics
- call into transform-generated class reflection hooks

This layer owns runtime comparison semantics. It should not need to inspect
class AST directly.

## Why Both Pieces Are Needed

The transform solves the class-shape problem.

The runtime solves the recursive-graph and collection problem.

Without the transform:

- classes cannot be compared structurally in a general way
- class diagnostics cannot enumerate members reliably

Without the runtime:

- generated class hooks would still need ad hoc code for arrays, maps, sets,
  cycles, and nested values
- each class would need to duplicate comparison policy instead of delegating to
  one shared engine

## Core Moving Parts

### Structural Equality Entry Point

The AssemblyScript runtime needs a single shared comparison entry point.

That entry point should:

- fast-path equal values
- handle nullable references
- handle special primitive rules such as `NaN`
- dispatch to reference-aware comparison for non-function reference types
- return enough state to distinguish:
- successful match
- failed match
- deferred match for currently resolving recursive pairs

### Pair Cache and Active Stack

Recursive data structures require two tracking collections:

- a cache of pairs already proven equal
- a stack of pairs currently being resolved

The cache prevents recomputing known equal subgraphs.

The active stack prevents recursive structures from blowing the stack or
incorrectly failing when a pair is revisited while still being resolved.

### Collection-Specific Comparison

The shared runtime should own specialized comparison branches for:

- `ArrayBuffer`
- arrays / `StaticArray` / arraylikes
- typed arrays / `ArrayBufferView`
- `Set`
- `Map`
- function references

These categories should not be expanded inline by the class transform.

### Generated Class Comparison Hook

Each instrumented class should receive a generated instance method that:

- verifies the compared reference is an instance of the same class
- casts it to the proper type
- compares each participating field/getter by delegating to the shared runtime
- delegates into `super` when appropriate
- avoids duplicate comparison of overridden/inherited members

This hook is the bridge between compile-time class shape and runtime recursive
comparison.

### Generated Class Reflection Hook

Diagnostics need a second generated method that:

- pushes reflected keys for participating fields/getters
- pushes reflected values by delegating back into shared reflected-value
  construction
- delegates into `super`
- avoids duplicate reporting of overridden members

This reflection hook is separate from equality. It exists for failure messages,
logs, and future structured diagnostics.

## Proposed Folder Scaffold

The transform scaffold should live under:

```text
cli/transform/
  README.md
  src/
    index.ts
    createStrictEqualsMember.ts
    createAddReflectedValueKeyValuePairsMember.ts
    hash.ts
    emptyTransformer.ts
```

This mirrors the minimum shape of the transform responsibilities without
committing to full implementation details yet.

## Proposed Implementation Sequence

### Phase 1. Contracts and Scaffolding

- scaffold `cli/transform/`
- define the runtime/transform split
- define the comparison-result model
- define the v1 supported value categories

### Phase 2. Transform-Generated Class Equality

- implement parser traversal
- inject generated class comparison methods
- support fields, getters, generics, and inheritance
- add transform fixtures that inspect generated output

### Phase 3. Shared Runtime Equality

- implement the recursive structural comparison engine
- add pair-cache and active-stack handling
- add collection-specialized branches
- delegate generic classes into generated hooks

### Phase 4. Reflected Diagnostics

- implement reflected-value construction primitives
- inject generated class reflection methods
- ensure reflected output and comparison walk the same member set

### Phase 5. Assertion Integration

- wire `node:assert.deepEqual(...)` or the chosen first API into the equality
  runtime
- normalize failure into `FailMessage` and trap
- decide where default error text is generated

### Phase 6. Compiler Integration

- register the transform through the CLI compiler wrapper
- ensure harness-aware compilation paths activate it consistently
- add inspection/debug workflow for generated methods

## Phase 1 Contract Decisions

### First Assertion Consumer

The machinery will be built as one shared strict structural comparison core with
assertion-level wrappers above it.

The first assertion API wired into that core should be
`node:assert.deepStrictEqual(...)`.

`node:assert.deepEqual(...)` is intentionally not part of the first assertion
integration wave. The adapter must not silently alias `deepEqual(...)` to strict
behavior until legacy loose-comparison semantics have been designed on purpose.

### Comparison Result Model

The runtime should use a tri-state result model:

- `Match`
- `Fail`
- `Defer`

`Defer` exists only for recursive reference graphs. It is returned when a
comparison revisits a pair that is already on the active-resolution stack.

Operationally:

- `Match` means the compared subgraph is proven equal
- `Fail` means the compared subgraph is proven unequal
- `Defer` means the compared subgraph is provisionally equal pending resolution
  of the outer pair currently being evaluated

When an enclosing comparison later resolves to `Match`, deferred pairs reached
through that frame are promoted into the proven-equal pair cache. If the
enclosing comparison resolves to `Fail`, the entire deferred chain fails with
it.

### V1 Supported Value Categories

The first shared equality core should support:

- primitives
- nullable references
- strings
- `ArrayBuffer`
- arrays, `StaticArray`, and other ordered arraylikes
- typed arrays and other `ArrayBufferView` implementations
- `Set`
- `Map`
- managed classes instrumented by the transform
- function references by identity only

Out of scope for v1:

- legacy loose `deepEqual(...)` coercion rules
- runtime-reflection fallback for arbitrary non-instrumented classes
- static members, instance methods, constructors, and computed members in
  generated class hooks

`NaN` should compare equal to `NaN` inside the strict structural core so the
runtime matches deep-structural assertion expectations instead of raw `==`
behavior.

### Class Member Selection and Inheritance

Generated class hooks should compare and reflect only participating instance
fields and instance getters.

Selection rules for v1:

- include instance fields declared on the class
- include instance getters declared on the class
- exclude static members
- exclude instance methods
- exclude constructors
- exclude computed members

Inheritance rules for v1:

- subclass hooks delegate into `super`
- subclasses compare or reflect only members declared on the subclass itself
- subclass-declared members suppress the same member identity from base-class
  reporting so overridden getters and shadowed fields are not duplicated
- any ignore-list or hash representation needed to implement that suppression is
  generated by the transform, not discovered by the runtime

The current transform-side member identity representation is a stable string
hash:

- `field:<name>` for instance fields
- `getter:<name>` for instance getters

### Runtime and Transform Boundary

The transform owns compile-time class-shape knowledge. The runtime owns
comparison policy.

The transform injects two instance hooks per instrumented class:

- `__asHarnessStrictEquals`
- `__asHarnessAddReflectedValueKeyValuePairs`

Current placeholder signatures used to establish the instrumentation path:

- `__asHarnessStrictEquals(other: usize): bool`
- `__asHarnessAddReflectedValueKeyValuePairs(): void`

These method signatures are intentionally scaffold-level. The strict-equality
hook will gain a richer runtime-context parameter contract when recursive
comparison lands, but field/getter delegation is now part of the generated body
shape.

The transform-side responsibilities are:

- same-class guard and cast
- participating-member enumeration
- `super` delegation
- per-member delegation back into shared runtime helpers

The current generated-body scaffold already performs inheritance delegation:

- generated `__asHarnessStrictEquals(...)` methods return `true` immediately
  when `other` is the same runtime reference as `this`
- generated `__asHarnessStrictEquals(...)` methods return `false` when `other`
  does not match the current class runtime type id
- derived `__asHarnessStrictEquals(...)` methods short-circuit to `false` when
  the generated `super` hook returns `false`
- derived `__asHarnessAddReflectedValueKeyValuePairs(...)` methods call the
  generated `super` hook before subclass-local work
- participating subclass members emit
  `__asHarnessStrictEqualsMember(...)` helper calls for primitive, string,
  nullable-reference-identity, and collection-placeholder members
- participating managed-class subclass members emit
  `__asHarnessStrictEqualsManagedClassMember("<member-hash>", this.<member>, changetype<Class>(other).<member>)`
  helper calls
- participating subclass members emit
  `__asHarnessAddReflectedValueKeyValuePair("<member-hash>", this.<member>)`
  helper calls

The AssemblyScript runtime now provides concrete entry points for the first part
of that contract:

- runtime-type-id extraction for guarded class casts
- primitive and string value comparison
- nullable-reference identity comparison
- `ArrayBuffer` bytewise comparison
- ordered comparison for `Array<T>` and `StaticArray<T>`
- bytewise typed-array / `ArrayBufferView` / `DataView` comparison
- managed-class recursion through transform-generated hooks

The member-helper path now covers `ArrayBuffer` plus typed arrays /
`ArrayBufferView` / `DataView`, while `Set` and `Map` still remain pending.
Ordered arrays / arraylikes and recursive managed-class comparison are also
routed through shared runtime helpers in Phase 3.

The runtime-side responsibilities are:

- primitive and nullable handling
- `NaN` normalization
- pair-cache and active-stack tracking
- specialized comparison for `Set`, `Map`, and function references
- reflected-value construction
- failure/result propagation

The current runtime implementation now includes the first shared helpers for:

- primitive equality fast paths
- string equality handling
- nullable-reference identity comparison
- `NaN` normalization for float primitive comparisons
- runtime-type-id checks used by generated class hooks
- pair-cache tracking for already-proven reference pairs
- active-stack tracking for in-flight reference pairs
- deferred-match handling for recursive reference cycles
- `ArrayBuffer` bytewise comparison
- ordered comparison for `Array<T>` and `StaticArray<T>`
- managed-class recursion delegated back into transform-generated hooks

### Transform Activation Policy

The CLI compiler wrapper should auto-enable the bundled strict-equality
transform for harness-aware builds that request `node:assert` or
`node:assert/strict` through `--lib`.

That activation should be wrapper-managed instead of requiring callers to pass
`--transform` manually. Builds that do not include assertion-oriented library
entry points should leave the transform disabled.

### Reflected Diagnostics Ordering

Reflected diagnostics remain part of the first machinery deliverable, but they
follow immediately after the equality core. They should not block the first
round of transform-generated class equality hooks, runtime recursion support, or
the initial `deepStrictEqual(...)` bridge.

## Remaining Decisions

The machinery plan is now constrained enough to start implementation, but one
important assertion-layer detail still needs to harden before the adapter work
finishes:

- how default deep-equality failure messages should be produced in v1

## Deliverable Boundaries

The first deliverable should be the machinery, not a fully complete
`node:assert` surface.

That means success for this workstream is:

- the transform can inject class comparison/reflection hooks
- the AssemblyScript runtime can recursively compare supported values
- the compiler wrapper can activate the transform
- `node:assert` can start consuming the resulting primitives one function at a
  time
