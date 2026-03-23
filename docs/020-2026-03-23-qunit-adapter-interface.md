# `qunit` Adapter Interface

This note answers which QUnit functions, types, and callback surfaces should be
implemented for `as-harness`, recommends an honest synchronous subset, and
defines the slice plan for `assembly/assembly/qunit/`, bundled CLI wiring, and
proof coverage. It also corrects the older repo placeholder name `qnit` to the
real package name `qunit`.

Repository policy note as of 2026-03-23: public installation is npm-only, annotated tags create notes-only GitHub release pages, and `@as-harness/cli` expects a consumer-installed `assemblyscript` peer.

## Question

What QUnit API surface should `as-harness` implement next, and how should that
surface be reduced into an honest adapter that matches the current shared
runtime?

## Recommendation

Ship `qunit` as a thin synchronous adapter centered on:

- a default-exported `QUnit` object
- callback-style `QUnit.module(...)` declarations with nested module hooks
- `QUnit.test(...)` plus root `only`, `skip`, and `todo` aliases
- named `test(...)` and `module(...)` exports that carry the `only`, `skip`,
  and `todo` modifier chains
- root test aliases `QUnit.only(...)`, `QUnit.skip(...)`, and `QUnit.todo(...)`
- global `QUnit.hooks.beforeEach(...)` and `QUnit.hooks.afterEach(...)`
- an adapter-local `Assert` callback object with a focused synchronous
  assertion subset, assertion counting, and step verification
- explicit documentation that async assertions, Promise-returning tests and
  hooks, options-object overloads, `test.each(...)`, event/reporter APIs,
  config plumbing, and dynamic JS `this` test context remain deferred

This is the closest honest fit to the current runtime. QUnit's declaration
graph, nested modules, hooks, and synchronous assertion core map cleanly onto
the shared suite/test/hook model. Its async helpers, Promise-aware assertions,
reporter callbacks, and dynamic object-context semantics do not.

## Affected Repo Areas

- `assembly/assembly/qunit/`
- `assembly/assembly/lib/qunit.ts`
- `assembly/assembly/test/internal/qunit.ts`
- `assembly/assembly/test/qunit-smoke.ts`
- `cli/as/compile.ts`
- `cli/run.test.ts`
- `assembly/roadmap.md`
- `agent-todo.md`

## Upstream Surface Summary

The current upstream package is `qunit@2.25.0`, with type definitions from
`@types/qunit@2.19.13`.

The published QUnit surface includes:

- a single exported `QUnit` object
- declaration APIs:
  - `QUnit.module(...)`
  - `QUnit.module.only(...)`
  - `QUnit.module.skip(...)`
  - `QUnit.module.todo(...)`
  - `QUnit.test(...)`
  - `QUnit.test.only(...)`
  - `QUnit.test.skip(...)`
  - `QUnit.test.todo(...)`
  - root aliases `QUnit.only(...)`, `QUnit.skip(...)`, `QUnit.todo(...)`
- global hooks:
  - `QUnit.hooks.beforeEach(...)`
  - `QUnit.hooks.afterEach(...)`
- module callback hook builders:
  - `before(...)`
  - `after(...)`
  - `beforeEach(...)`
  - `afterEach(...)`
- assertion surface on the callback `assert` object:
  - sync assertions such as `ok`, `notOk`, `true`, `false`, `equal`,
    `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`,
    `notDeepEqual`, `throws`, `expect`, `pushResult`, `step`, and
    `verifySteps`
  - async helpers such as `async()`, `rejects()`, and `timeout()`
  - additional property and partial-match families such as `propEqual()`,
    `propContains()`, `notPropEqual()`, and `notPropContains()`
- broader framework/runtime APIs:
  - `QUnit.begin(...)`, `done(...)`, `log(...)`, `moduleStart(...)`,
    `moduleDone(...)`, `testStart(...)`, `testDone(...)`
  - `QUnit.config`
  - `QUnit.assert` extension namespace
  - `QUnit.start()`, `onUncaughtException`, `dump`, `equiv`, and others

## Honest Shipped Subset

### Module and test declarations

Ship these on the default `QUnit` export:

- `QUnit.module(name, nested)`
- `QUnit.test(name, callback)`
- `QUnit.only(name, callback)`
- `QUnit.skip(name, callback?)`
- `QUnit.todo(name, callback?)`

Ship these as named exports:

- `module.only(name, nested)`
- `module.skip(name, nested)`
- `module.todo(name, nested)`
- `test.only(name, callback)`
- `test.skip(name, callback?)`
- `test.todo(name, callback?)`

The shipped behavior should be:

- `skip` lowers to skipped declarations
- `only` lowers to focused declarations
- `todo(name)` without a callback lowers to a placeholder todo declaration
- `todo(name, callback)` lowers to expected-failure execution, because that is
  what real QUnit todo tests mean
- `module.todo(...)` propagates expected-failure semantics to descendant tests
  declared in that module scope

### Hook builders

Ship:

- `QUnit.hooks.beforeEach(fn)`
- `QUnit.hooks.afterEach(fn)`
- module callback hook builder object with:
  - `before(fn)`
  - `after(fn)`
  - `beforeEach(fn)`
  - `afterEach(fn)`

### Callback `Assert` object

Ship an adapter-local `Assert` object passed to tests and hooks with:

- assertion planning and custom results:
  - `expect(count)`
- boolean and equality assertions:
  - `ok`
  - `notOk`
  - `true`
  - `false`
  - `equal`
  - `notEqual`
  - `strictEqual`
  - `notStrictEqual`
  - `deepEqual`
  - `notDeepEqual`
- thrown-error assertion:
  - `throws`
- ordered-step assertions:
  - `step`
  - `verifySteps`

`step(...)` and `verifySteps(...)` should aggregate calls made from root hooks,
module hooks, and the active test body within one execution attempt.

## Intentional Divergences

These differences should be documented explicitly:

- the adapter exports a default `QUnit` object plus adapter-local types; it does
  not attempt to reproduce every host-side event, reporter, or config API
- the default `QUnit` export carries callable `test(...)` / `module(...)`
  methods, but the modifier chains live on the named `test` and `module`
  exports because AssemblyScript does not honestly support JS-style callable
  nested object properties like `QUnit.test.only(...)`
- `QUnit.module(...)` only ships the callback form; the options-object overload
  and open-ended “subsequent tests belong to this module” form stay deferred
- `QUnit.module.if(...)` and `QUnit.test.if(...)` stay deferred because the
  chained keyword-property shape is not honest to expose through the current
  AssemblyScript-only surface without additional transform machinery
- `assert.throws(...)` ships only the callback plus optional message form; the
  upstream matcher overloads stay deferred
- hook assertions count toward the active `assert.expect(...)` plan, matching
  the shared assertion-scope model used during one test execution
- `QUnit.todo(name, callback)` and `QUnit.test.todo(name, callback)` are
  represented as expected-failure tests instead of declaration-mode todo nodes,
  because the shared runtime's declaration-mode todo semantics intentionally
  differ from QUnit's runnable todo tests
- JS-style dynamic `this` test context is unsupported; use lexical/module
  variables instead
- `QUnit.assert` as a root assertion-extension namespace stays deferred to avoid
  implying module-scope assertion execution support
- no Promise-returning callbacks or async assertions are claimed

## Deferred Surface

The following upstream features should stay explicitly out of scope for this
adapter cycle:

- async assertions and Promise helpers:
  - `assert.async()`
  - `assert.rejects()`
  - `assert.timeout()`
- custom-result object helpers:
  - `assert.pushResult(...)`
- data-driven helpers:
  - `test.each(...)`
  - `only.each(...)`
  - `skip.each(...)`
  - `todo.each(...)`
- conditional keyword-property helpers:
  - `test.if(...)`
  - `module.if(...)`
- options-object module overloads and open-ended module scope
- property and partial-match assertions:
  - `propEqual`
  - `propContains`
  - `notPropEqual`
  - `notPropContains`
- root framework callbacks and config APIs:
  - `begin`, `done`, `log`, `moduleStart`, `moduleDone`, `testStart`,
    `testDone`
  - `config`
  - `start`
  - `onUncaughtException`
  - `dump`
  - `equiv`
  - `urlParams`
- dynamic JS test context and broader reporter integration

## Why This Subset Fits The Current Runtime

- QUnit modules map onto the shipped suite graph already used by `node:test`
  and `vitest`.
- QUnit hooks line up with the shared root and nested hook machinery.
- the selected sync assertions already exist in the shared assertion bridge or
  can be implemented locally without new host protocols.
- ordered step verification can be implemented as adapter-local per-execution
  state.
- the async, config, and reporter APIs would require runtime ownership changes
  that this repo has intentionally not shipped.

## Implementation Slices

### `qunit-001`: interface note, naming correction, and live backlog plan

Goals:

- add this `qunit` interface note
- replace the `qnit` placeholder TODO with a real `qunit` TODO
- correct live roadmap and backlog references from `qnit` to `qunit`
- expand `agent-todo.md` with concrete remaining slices and runtime-fit risks

Files:

- `docs/020-2026-03-23-qunit-adapter-interface.md`
- `assembly/assembly/qunit/TODO.md`
- `assembly/roadmap.md`
- `agent-todo.md`
- `CHANGELOG.md`

### `qunit-002`: declaration, module, and hook shell

Goals:

- add `assembly/assembly/qunit/index.ts`, `types.ts`, and `parse.ts`
- ship the default `QUnit` object with module/test declarations and modifiers
- ship root aliases and global hooks
- ship module callback hook builders
- add internal proof for nested modules, hook registration, and propagated
  modifier defaults

Files:

- `assembly/assembly/qunit/index.ts`
- `assembly/assembly/qunit/types.ts`
- `assembly/assembly/qunit/parse.ts`
- `assembly/assembly/test/internal/qunit.ts`
- `assembly/assembly/test/index.ts`

### `qunit-003`: assertion and smoke slice

Goals:

- add the shipped `Assert` surface
- add ordered-step bookkeeping
- add one `qunit` smoke fixture that proves nested modules, global hooks,
  module hooks, expected-failure todo semantics, and shared assertion lowering
  across the shared host matrix

Files:

- `assembly/assembly/qunit/types.ts`
- `assembly/assembly/test/internal/qunit.ts`
- `assembly/assembly/test/qunit-smoke.ts`
- `harness/shared/smoke-suite.cjs`
- `assembly/assembly/qunit/TODO.md`
- `agent-todo.md`
- `CHANGELOG.md`

### `qunit-004`: bundled CLI surface and shipped docs

Goals:

- add bundled lib entry `assembly/assembly/lib/qunit.ts`
- wire `qunit` through CLI compile rewriting
- regenerate the bundled virtual AssemblyScript files
- add one direct bundled CLI proof
- mark `qunit` as shipped in READMEs, roadmap, and backlog docs

Files:

- `assembly/assembly/lib/qunit.ts`
- `cli/as/compile.ts`
- `cli/as/compile.test.ts`
- `cli/as/virtual-files.generated.ts`
- `cli/run.test.ts`
- `README.md`
- `assembly/README.md`
- `cli/README.md`
- `assembly/roadmap.md`
- `assembly/assembly/qunit/TODO.md`
- `agent-todo.md`
- `CHANGELOG.md`

## Exit Criteria

The adapter is complete for this cycle when:

1. nested `QUnit.module(...)` declarations and module hooks are discoverable
2. root aliases and global hooks lower cleanly to the shared runtime
3. callback `Assert` objects provide the shipped sync assertion subset
4. runnable todo tests behave as expected-failure executions
5. the cross-host smoke fixture proves the shipped module/test/assertion slice
6. bundled CLI compile rewriting recognizes `qunit`
7. one direct bundled CLI test proves the shipped `qunit` subset
8. docs and backlog files list `qunit` as shipped and keep deferred behavior
   explicit

## Sources

- official QUnit docs:
  - `https://qunitjs.com/api/QUnit/module/`
  - `https://qunitjs.com/api/QUnit/test/`
  - `https://qunitjs.com/api/QUnit/hooks/`
  - `https://qunitjs.com/lifecycle/`
  - `https://qunitjs.com/api/assert/expect/`
  - `https://qunitjs.com/api/assert/step/`
  - `https://qunitjs.com/api/assert/verifySteps/`
- published package metadata from `qunit@2.25.0`, inspected locally with
  `npm pack qunit`
- published type definitions from `@types/qunit@2.19.13`, inspected locally
  with `npm pack @types/qunit`
