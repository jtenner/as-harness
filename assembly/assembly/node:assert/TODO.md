# `node:assert` Adapter TODO

## Scope

Build the first assertion-library adapter pair under:

- `assembly/assembly/node:assert`
- `assembly/assembly/node:assert/strict`

## Investigated Surface

Baseline used for this inventory:

- official Node.js `assert.html` docs for `v25.8.1`
- local runtime inspection against `node v25.8.0`

Observed export keys from `require('node:assert')` in `v25.8.0`:

- `Assert`
- `AssertionError`
- `deepEqual`
- `deepStrictEqual`
- `doesNotMatch`
- `doesNotReject`
- `doesNotThrow`
- `equal`
- `fail`
- `ifError`
- `match`
- `notDeepEqual`
- `notDeepStrictEqual`
- `notEqual`
- `notStrictEqual`
- `ok`
- `partialDeepStrictEqual`
- `rejects`
- `strict`
- `strictEqual`
- `throws`

Observed export keys from `require('node:assert/strict')` in `v25.8.0`:

- same names as `node:assert`

Observed alias relationships in `v25.8.0`:

- the default export is callable and acts as `assert(value[, message])`
- `assert(value[, message])` is an alias of `assert.ok(value[, message])`
- `require('node:assert').strict === require('node:assert/strict')`
- `node:assert/strict` keeps the same property names as `node:assert`; the semantic differences are in how the legacy comparators behave

## Public API Inventory

Classes:

- `assert.AssertionError`
- `new assert.AssertionError(options)`
- `assert.Assert`
- `new assert.Assert([options])`

Callable/default export:

- `assert(value[, message])`

Top-level assertion functions documented by Node:

- `assert.deepEqual(actual, expected[, message])`
- `assert.deepStrictEqual(actual, expected[, message])`
- `assert.doesNotMatch(string, regexp[, message])`
- `assert.doesNotReject(asyncFn[, error][, message])`
- `assert.doesNotThrow(fn[, error][, message])`
- `assert.equal(actual, expected[, message])`
- `assert.fail([message])`
- `assert.ifError(value)`
- `assert.match(string, regexp[, message])`
- `assert.notDeepEqual(actual, expected[, message])`
- `assert.notDeepStrictEqual(actual, expected[, message])`
- `assert.notEqual(actual, expected[, message])`
- `assert.notStrictEqual(actual, expected[, message])`
- `assert.ok(value[, message])`
- `assert.rejects(asyncFn[, error][, message])`
- `assert.strictEqual(actual, expected[, message])`
- `assert.throws(fn[, error][, message])`
- `assert.partialDeepStrictEqual(actual, expected[, message])`

Also present in the runtime surface:

- `assert.strict`

## Legacy vs Strict Behavior

Node documents two entry modes:

- legacy assertion mode via `node:assert`
- strict assertion mode via `node:assert/strict` or `require('node:assert').strict`

Behavior differences that matter for adapter design:

- `deepEqual`, `equal`, `notDeepEqual`, and `notEqual` are the legacy-mode methods whose semantics change across the two entry points
- in strict mode, non-strict methods behave like their strict counterparts
- in strict mode, object assertion failures also include diff-oriented messaging
- `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `notDeepStrictEqual`, `partialDeepStrictEqual`, `match`, `doesNotMatch`, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `ifError`, `fail`, and `ok` keep the same names across both entry points

## `Assert` Class Details

Documented constructor options:

- `diff`: `'simple' | 'full'`
- `strict`: `boolean`, default `true`
- `skipPrototype`: `boolean`, default `false`

Important runtime and docs notes:

- the class exists specifically to create configured assertion instances
- destructuring methods off an `Assert` instance loses the instance configuration and falls back to default behavior
- in the local runtime, instances expose configurable legacy-vs-strict pivots as own properties: `equal`, `notEqual`, `deepEqual`, `notDeepEqual`, plus `AssertionError`
- the rest of the assertion methods live on the prototype

## `AssertionError` Details

Documented constructor option fields:

- `message`
- `actual`
- `expected`
- `operator`
- `stackStartFn`
- `diff`

Documented instance fields:

- `message`
- `name`
- `actual`
- `expected`
- `generatedMessage`
- `code`
- `operator`

## Adapter Mapping Notes

Shared primitive candidates for the Wasm assertion bridge:

- callable/default `assert(value[, message])`
- `ok`
- `equal`
- `strictEqual`
- `deepEqual`
- `deepStrictEqual`
- `notEqual`
- `notStrictEqual`
- `notDeepEqual`
- `notDeepStrictEqual`
- `fail`
- `match`
- `doesNotMatch`
- `ifError`

APIs that still need separate design work because they are not yet covered by
the current synchronous bridge slices:

- matcher-aware `throws(fn[, error][, message])`
- matcher-aware `doesNotThrow(fn[, error][, message])`
- `match`
- `doesNotMatch`
- `rejects`
- `doesNotReject`
- `partialDeepStrictEqual`
- `Assert`
- `AssertionError`

Practical first-pass split for this repo:

- `node:assert`: expose the full exported names, but implement legacy-vs-strict differences only where meaningful for the adapter
- `node:assert/strict`: same exported names, with `equal`/`deepEqual`/`notEqual`/`notDeepEqual` lowered as strict variants
- keep `assert.strict` as the namespace alias for the strict entry point
- keep the callable/default export as an alias of `assert.ok(value[, message])`
- keep adapter code thin and push message emission and unreachable-failure behavior into the shared bridge
- first shared structural-equality consumer: `deepStrictEqual`
- keep legacy `deepEqual` out of the first bridge wave until its loose semantics are designed explicitly

## Structure

- [x] Define the shared files and boundaries between `node:assert` and `node:assert/strict`.
- [x] Decide which implementation can be shared and which behavior must differ for `strict`.
- [x] Confirm how these folders will be exposed as AssemblyScript `--lib` entry points.

## Assertion Surface

- [x] List the `node:assert` APIs that the adapter must support first.
- [x] Identify which APIs should lower directly into the shared assertion bridge.
- [x] Identify which APIs require message handling before failure emission.
- [x] Identify which APIs need strict-only behavior differences.

## Runtime Integration

- [x] Define the internal assertion primitive this adapter should call.
- [x] Define how assertion failures emit `FailMessage` before becoming unreachable.
- [ ] Ensure the adapter works the same inside tests and lifecycle callbacks.
- [x] Keep adapter code thin and free of host-side policy.

## Initial Deliverables

- [x] Add the first source files for `node:assert`.
- [x] Add the first source files for `node:assert/strict`.
- [x] Add a minimal fixture that proves an assertion failure reaches the shared Wasm failure path.
