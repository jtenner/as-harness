# Jest Adapter

This document describes the current `jest` guest-library surface provided by
`as-harness`.

It is a thin, synchronous Jest-shaped adapter built on the same Wasm runtime
used by `node:test` and `node:assert`. It is intentionally not full Jest
compatibility.

## Enable It

Compile and run test files with:

```bash
bun run ./cli/index.ts run --lib jest ./suite.test.ts
```

The `jest` module path is provided by the CLI's bundled guest libraries. It is
not meant to be installed from npm inside the guest test source.

## Current Scope

Supported today:

- synchronous `test(...)` / `it(...)` / `describe(...)`
- `only` / `skip` / `todo` modifiers and the common `x*` / `f*` aliases
- `beforeAll`, `afterAll`, `beforeEach`, and `afterEach`
- a small `expect(...)` matcher surface backed by the shared assertion bridge
  for equality, containment, length/size checks, numeric comparisons, `NaN`,
  and trap observation

Explicitly out of scope today:

- Promise-based or async Jest helpers
- mocks, spies, and call-tracking helpers
- snapshot APIs
- broad matcher parity with upstream Jest
- matcher-aware throw inspection such as matching on error text or type

## Declaration API

These exports are currently available from `"jest"`:

### Test Declarations

- `test(name?: string, callback?: TestFn | null): void`
- `test.only(name?: string, callback?: TestFn | null): void`
- `test.skip(name?: string, callback?: TestFn | null): void`
- `test.todo(name?: string, callback?: TestFn | null): void`
- `xtest(name?: string, callback?: TestFn | null): void`
- `fit(name?: string, callback?: TestFn | null): void`

`it(...)` is an alias family with the same behavior:

- `it(name?: string, callback?: TestFn | null): void`
- `it.only(name?: string, callback?: TestFn | null): void`
- `it.skip(name?: string, callback?: TestFn | null): void`
- `it.todo(name?: string, callback?: TestFn | null): void`
- `xit(name?: string, callback?: TestFn | null): void`

### Suite Declarations

- `describe(name?: string, callback?: SuiteFn | null): void`
- `describe.only(name?: string, callback?: SuiteFn | null): void`
- `describe.skip(name?: string, callback?: SuiteFn | null): void`
- `describe.todo(name?: string, callback?: SuiteFn | null): void`
- `fdescribe(name?: string, callback?: SuiteFn | null): void`
- `xdescribe(name?: string, callback?: SuiteFn | null): void`

### Hooks

- `beforeAll(callback?: HookFn | null): void`
- `afterAll(callback?: HookFn | null): void`
- `beforeEach(callback?: HookFn | null): void`
- `afterEach(callback?: HookFn | null): void`

The hook and test callback signatures are AssemblyScript-specific and stay
synchronous:

- `TestFn = (context: TestContext) => void`
- `SuiteFn = (context: SuiteContext) => void`
- `HookFn = (context: TestContext) => void`

## `expect(...)`

The supported matcher surface is intentionally small.

### Positive Matchers

- `expect<T>(actual).toBe(expected, message?)`
- `expect<T>(actual).toEqual(expected, message?)`
- `expect<T>(actual).toStrictEqual(expected, message?)`
- `expect<T>(actual).toBeTruthy(message?)`
- `expect<T>(actual).toBeFalsy(message?)`
- `expect<T>(actual).toBeNull(message?)`
- `expect<T>(actual).toBeUndefined(message?)`
- `expect<T>(actual).toBeDefined(message?)`
- `expect(actual).toContain(expected, message?)`
- `expect(actual).toContainEqual(expected, message?)`
- `expect(actual).toHaveLength(expected, message?)`
- `expect<T>(actual).toBeGreaterThan(expected, message?)`
- `expect<T>(actual).toBeLessThan(expected, message?)`
- `expect<T>(actual).toBeNaN(message?)`
- `expect<() => void>(callback).toThrow(message?)`

### Negated Matchers

The `.not` property exposes the same currently-supported matcher family:

- `expect<T>(actual).not.toBe(expected, message?)`
- `expect<T>(actual).not.toEqual(expected, message?)`
- `expect<T>(actual).not.toStrictEqual(expected, message?)`
- `expect<T>(actual).not.toBeTruthy(message?)`
- `expect<T>(actual).not.toBeFalsy(message?)`
- `expect<T>(actual).not.toBeNull(message?)`
- `expect<T>(actual).not.toBeUndefined(message?)`
- `expect<T>(actual).not.toBeDefined(message?)`
- `expect(actual).not.toContain(expected, message?)`
- `expect(actual).not.toContainEqual(expected, message?)`
- `expect(actual).not.toHaveLength(expected, message?)`
- `expect<T>(actual).not.toBeGreaterThan(expected, message?)`
- `expect<T>(actual).not.toBeLessThan(expected, message?)`
- `expect<T>(actual).not.toBeNaN(message?)`
- `expect<() => void>(callback).not.toThrow(message?)`

### Equality Semantics

- `toBe(...)` uses the shared strict-equality bridge.
- `toEqual(...)` and `toStrictEqual(...)` currently map to the same shared
  deep strict-equality machinery.
- The deep-equality behavior is defined by the guest runtime, not by upstream
  Jest's full matcher semantics.

### Containment and Length Semantics

`toContain(...)` and `toContainEqual(...)` currently support these container
families:

- arrays
- array-like values such as typed arrays
- `Set`
- `Map`

For container expectations:

- `toContain(...)` uses shared strict equality over contained values
- `toContainEqual(...)` uses the shared deep strict-equality machinery
- `Map` containment is defined over keys, not values
- `toHaveLength(...)` reads `.length` for arrays, typed arrays, and strings
- `toHaveLength(...)` reads `.size` for `Set` and `Map`

Examples:

```ts
import { expect } from "jest";

const values = [1, 2, 3];
expect(values).toContain(2);
expect(values).toHaveLength(3);

const keys = new Map<Array<i32>, string>();
keys.set([1, 2], "value");
expect(keys).toContainEqual([1, 2]);
expect(keys).toHaveLength(1);
```

### Numeric Matchers

The current numeric matcher set is:

- `toBeGreaterThan(...)`
- `toBeLessThan(...)`
- `toBeNaN()`

These stay intentionally narrow:

- `toBeGreaterThan(...)` and `toBeLessThan(...)` are meaningful for integer and
  float values
- `toBeNaN()` is meaningful for float values
- non-numeric or unsupported value kinds simply fail the matcher

### `toThrow()` Semantics

`toThrow()` is intentionally narrow.

- The accepted callback shape is effectively `() => void`.
- The callback return value is ignored.
- The matcher only checks trap vs non-trap.
- It does not inspect error text, constructor type, or pattern matches.
- `.not.toThrow()` means the callback completed normally across the
  host-managed trampoline boundary.

Because AssemblyScript still does not provide the same closure model as normal
JavaScript, this matcher should be treated as a single callback probe rather
than full Jest closure-aware throw behavior.

In practice, the safe forms are:

- top-level function references
- closure-free inline callbacks

Example:

```ts
import { describe, expect, test } from "jest";

function traps(): void {
  unreachable();
}

describe("throws", () => {
  test("checks trap state", () => {
    expect<() => void>(traps).toThrow();
    expect<() => void>(((): void => {})).not.toThrow();
  });
});
```

## Strings and Messages

Names and optional matcher messages use normal AssemblyScript `string` values.
Inside guest memory those are UTF-16 strings, because that is how
AssemblyScript represents `string`. Once the runtime emits events to the host,
the relevant message payloads are serialized by the guest runtime and decoded by
the host harness.

## Relationship To The Shared Runtime

This adapter is intentionally thin:

- declaration helpers lower into the same shared node-registration runtime used
  by `node:test`
- `expect(...)` matchers lower into the shared assertion bridge used by
  `node:assert`
- `toThrow()` lowers into the shared trampoline-based trap-observation path

That means new host implementations do not need special Jest logic. They only
need to satisfy the normal harness ABI documented in [harness-abi.md](./harness-abi.md).

## Related Docs

- Main repo overview: [README.md](../README.md)
- Assembly package overview: [assembly/README.md](../assembly/README.md)
- CLI overview: [cli/README.md](../cli/README.md)
- Harness ABI: [harness-abi.md](./harness-abi.md)
