# v0.4.0 Roadmap And Adapter Priority

This note answers what should come after the `v0.3.0` release, recommends a
`v0.4.0` plan centered on runtime hardening plus a new adapter wave, and covers
the affected CLI packaging, host verification, and guest adapter areas in
`cli/`, `harness/`, and `assembly/`. The recommendation is to spend the first
`v0.4.0` slice on restoring confidence in the shipped packaged/runtime matrix,
then add new test adapters `mocha` and `jasmine` in that order, while keeping
`uvu`, `ava`, `tap`, and `tape` deferred until the shared runtime can support
their execution models honestly without inventing compatibility theater.

## Why This Is The Right Next Step

`v0.3.0` already completed the first scheduler-aware native `"as-harness"`
surface, the first global graph-planning host slice, and the thin shipped
`jest` / `vitest` adapters. The remaining work visible in the repo is now split
cleanly into two categories:

- open runtime and packaging risks that still affect shipped behavior
- unclaimed product growth opportunities, with adapters being the clearest next
  user-facing surface

That means the next release should not reopen the completed scheduler blockers.
It should instead:

1. harden the current packaged and source-host story
2. add two more synchronous adapters that fit the current guest/runtime model
3. keep deferred adapters explicitly deferred rather than overpromising parity

## Recommended `v0.4.0` Shape

### Phase 1: Runtime Hardening

Make the current release matrix less provisional before widening the surface
area further.

Primary target:

- prove whether bundled Linux `wazero` can safely return to the compiler engine
  instead of the current interpreter-only packaged fallback

Supporting work:

- keep source and bundled `wazero` runtime loading paths explicit until they can
  be unified with hosted proof on Windows and packaged proof on Linux
- preserve the Node-targeted source-host CLI verification path until Bun's
  Windows native-addon behavior no longer requires the workaround
- keep toolchain refreshes and hosted timeout budgets explicit in CI and release
  docs

The practical release question for this phase is simple: can `v0.4.0` ship
with fewer “temporary but necessary” runtime caveats than `v0.3.0`?

### Phase 2: Adapter Expansion

After the packaged/runtime baseline is stable, add more adapters that map
cleanly onto the shared synchronous runtime without inventing adapter-local
schedulers or pretending async semantics exist.

Recommended shipped order for this release line:

1. `mocha`
2. `jasmine`

These two are the best fit because each can start with a thin declaration and
hook surface that mostly lowers into the existing tree, traversal, and shared
assertion machinery. `uvu` is still a reasonable later candidate, but it no
longer belongs in the committed `v0.4.0` slice.

### Phase 3: Contract And Proof Refresh

Every new adapter should land with the same discipline used for the existing
surfaces:

- adapter doc describing shipped scope and explicit non-goals
- bundled guest lib entrypoint
- compile coverage
- cross-host smoke coverage through `js`, `wazero`, and `wasmtime`
- CLI proof where the adapter meaningfully affects discovery, execution, or
  reporting copy

## Adapter Ranking

### 1. `mocha`

Recommended as the first new adapter.

Why it fits:

- the basic `describe` / `it` / hook vocabulary is already present in the
  shared runtime and in the thin `jest` / `vitest` surfaces
- the first slice can stay intentionally synchronous and declaration-shaped
- it adds a familiar ecosystem surface without forcing new ABI or scheduler
  semantics

First honest slice:

- `describe`, `context`, `suite`
- `it`, `test`, `specify`
- `.only`, `.skip`, `x*` aliases
- `before`, `after`, `beforeEach`, `afterEach`
- shared `node:assert` or minimal assertion guidance rather than broad Chai
  parity

Do not promise yet:

- callback `done`
- Promise-returning tests
- retries, timeouts, or broad CLI parity with upstream Mocha configuration
- `this`-bound runtime behavior beyond what AssemblyScript can model honestly

### 2. `jasmine`

Recommended as the second adapter.

Why it fits:

- its suite and test declaration shape is close to the existing `jest` work
- the first slice can reuse the shared matcher and hook foundation
- the biggest missing piece, spies, is already a clearly documented non-goal for
  the current runtime

First honest slice:

- `describe`, `fdescribe`, `xdescribe`
- `it`, `fit`, `xit`
- `beforeAll`, `afterAll`, `beforeEach`, `afterEach`
- `pending`/skip-like declaration behavior where it can be represented as
  existing declaration metadata
- `expect(...)` backed by the current shared matcher core

Do not promise yet:

- spies
- async completion callbacks
- custom matcher registration
- snapshot-style or reporter/plugin ecosystems

## Deferred Adapters

### `uvu`

Defer until after the `mocha` and `jasmine` slice lands. It is still a viable
thin-adapter candidate, but it is less urgent than the two mainstream
declaration-and-hook surfaces above and should not dilute proof density for the
committed `v0.4.0` work.

### `ava`

Defer until async and Promise support are strong enough to represent AVA's real
model without a misleading compatibility veneer. A fake sync-only AVA surface
would likely be more confusing than useful.

### `tap` And `tape`

Defer until the project is willing to define a richer per-test assertion object
contract and clearer plan-driven execution semantics. Both can probably be done
eventually, but they are less “thin adapter over existing runtime” and more
“adapter shape that wants additional runtime identity and assertion behavior”.

## Suggested Implementation Order

1. investigate and, if safe, restore bundled Linux `wazero` compiler-engine
   execution with packaged proof
2. document the stabilized runtime matrix and remove any shipped caveats that
   are no longer true
3. add `mocha` adapter docs + TODO refresh + first guest library slice
4. add `mocha` smoke, compile, and cross-host proof
5. add `jasmine` using the same thin-adapter pattern
6. leave `uvu`, `ava`, `tap`, and `tape` explicitly deferred rather than
   partially implemented

## Release Boundary Recommendation

Treat `v0.4.0` as successful if it delivers both of these outcomes:

- the current packaged/source-host matrix is easier to explain and carries fewer
  runtime caveats than `v0.3.0`
- the project ships `mocha` and `jasmine` as thin synchronous adapters with the
  same proof and documentation quality as `jest` and `vitest`

If runtime hardening expands, reduce adapter ambition inside `jasmine` before
reducing proof density. Shipping two well-proved adapters is better than
carrying a wider but ambiguous adapter list.
