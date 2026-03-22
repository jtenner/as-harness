# Harness Todo

## v0.4.0

### Blockers

- decide whether bundled Linux `wazero` can safely leave the current
  interpreter-engine fallback and return to the compiler engine with packaged
  proof on the staged release path.
- keep the current source-host versus packaged `wazero` runtime split explicit
  until hosted Windows and packaged Linux proof show a safe unification path.
- keep the Node-targeted source-host CLI verification path until Bun's Windows
  native-addon behavior no longer makes direct source CLI execution unreliable.

### Risks

- packaged release archives now intentionally preserve the inner executable
  basename because current Bun standalone native-addon loading is sensitive to
  renaming the compiled Linux executable.
- future scheduler changes are mostly semantic and order-related, so proof
  density still matters.
- CI, release, and repo-local verification are pinned in `.mise.toml` to
  current upstream Bun/Node/Go/Rust stable releases, so external toolchain
  rollovers still need explicit baseline refreshes here.
- source and bundled `wazero` CLI runtime loading now intentionally diverge:
  source mode routes both main-thread and worker-thread creation through an
  absolute-path CJS harness module that stages a private addon copy under Bun
  on Windows, while packaged mode keeps the bundled extraction path, so future
  refactors need hosted Windows and packaged Linux proof before trying to
  unify them.
- source-host CLI proof now runs a Bun-built Node-targeted bundle under the
  Node 25 matrix because Bun still has open Windows native-addon crash issues
  on direct source CLI execution; future tooling changes should preserve that
  distinction until the upstream runtime bug is actually gone.
- bundled Linux `wazero` now forces the interpreter engine to avoid the hosted
  packaged createHarness hang, so future work should confirm whether the
  compiler engine can be restored safely.
- packaged verifier builds now get a longer timeout budget than smoke runs, but
  first-time native dependency downloads can still skew hosted CI timing.

### Runtime Hardening

#### Slice 1: Packaged `wazero` Engine Decision

- investigate the remaining bundled Linux `wazero` compiler-engine hang from
  the staged packaged path and either restore the compiler engine with proof or
  explicitly freeze the interpreter-only packaged policy as the deliberate
  contract.
- keep the packaged proof anchored in the staged release archive path rather
  than repo-local execution so any `wazero` engine decision is proved against
  the real shipped install shape.
- if the compiler engine is restored, add focused regression proof that the
  packaged Linux `wazero` harness still exits cleanly after successful runs.

#### Slice 2: Runtime Matrix Cleanup

- refresh the packaged/source-host runtime notes once the `wazero` engine and
  loader boundaries are settled so release, README, and CI guidance all reflect
  the real shipped matrix.
- keep the source and bundled `wazero` loader split explicit until hosted
  Windows and packaged Linux proof show a safe unification path.
- keep the Node-targeted source-host CLI verification path in place until the
  upstream Bun Windows native-addon crash class is no longer a real repo-level
  constraint.
- keep CI and release baselines in `.mise.toml` aligned with the current native
  host requirements when upstream Bun, Node, Go, or Rust stable releases roll.

### Adapter: `mocha`

#### Slice 3: `mocha` Declaration Surface

- add `assembly/assembly/mocha/index.ts` plus bundled guest-lib wiring for a
  BDD-only `mocha` surface.
- ship `describe`, `context`, `it`, `specify`, `before`, `after`,
  `beforeEach`, and `afterEach`.
- ship `describe.only`, `context.only`, `it.only`, `specify.only`,
  `describe.skip`, `context.skip`, `it.skip`, `specify.skip`, and the `x*`
  aliases.
- treat callback-less `it(...)` and `specify(...)` as pending declarations.
- keep the first slice synchronous and declaration-shaped with no adapter-local
  scheduler behavior.

#### Slice 4: `mocha` Compatibility Boundaries

- keep callback `done`, returned `Promise`, and `async` / `await` out of scope.
- keep callback `this` context out of scope, including `this.skip()`,
  `this.timeout()`, `this.slow()`, and `this.retries()`.
- keep chainable declaration modifiers such as `.timeout(...)` out of scope
  until the repo is willing to return non-void declaration handles from the
  adapter.
- keep delayed root suites, root hook plugins, and any guest-owned runner entry
  such as `run()` out of scope.
- document the known skipped-suite divergence: upstream `mocha` still executes
  `describe.skip(...)` callbacks for structure building, while current
  `as-harness` skip semantics prune skipped-suite descendants.
- do not imply bundled Chai support; keep assertion guidance on shared
  `node:assert` and the existing guest assertion boundary.

#### Slice 5: `mocha` Proof And Release Readiness

- add compile fixtures that lock the supported declaration, alias, hook, and
  callback-less pending forms.
- add guest and cross-host smoke coverage for declaration shape, `only`,
  `skip`, pending declarations, and hook ordering.
- add CLI smoke through `js`, `wazero`, and `wasmtime`.
- update the adapter docs and README set only when the supported surface and
  explicit non-goals are proved end to end.

### Adapter: `jasmine`

#### Slice 6: `jasmine` Declaration And Hook Surface

- add `assembly/assembly/jasmine/index.ts` plus bundled guest-lib wiring for a
  thin synchronous `jasmine` surface after `mocha`.
- ship `describe`, `fdescribe`, `xdescribe`, `it`, `fit`, `xit`,
  `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, and `fail`.
- treat callback-less `it(...)` as a pending-like non-runnable declaration and
  document the exact reporting wording once the adapter is implemented.
- keep the first slice synchronous and do not expose per-call timeout
  parameters until the shared runtime actually promises timeout enforcement.

#### Slice 7: `jasmine` Matcher Surface

- expose `expect(...)` backed by the current shared matcher core rather than
  inventing a new assertion subsystem.
- ship the first matcher slice with `.not`, `toBe`, `toEqual`, `toBeDefined`,
  `toBeFalsy`, `toBeTruthy`, `toBeNull`, `toBeUndefined`, `toContain`,
  `toBeGreaterThan`, `toBeLessThan`, `toBeNaN`, and `toThrow`.
- keep richer but plausible matchers such as `toBeCloseTo`, the ordered numeric
  variants, `toHaveSize`, `toMatch`, `withContext`, and the infinity/nullish
  helpers for later only if the shared matcher core needs them.
- keep spy-aware, DOM-aware, constructor-aware, and richer thrown-error
  matchers out of scope for this slice.

#### Slice 8: `jasmine` Compatibility Boundaries

- keep `expectAsync(...)` and the async matcher family out of scope until the
  guest runtime has real Promise-aware execution.
- keep `pending()` out of scope until the shared runtime has a clear generic
  runtime pending/skip operation instead of declaration-time metadata only.
- keep `spyOn`, `spyOnAllFunctions`, `spyOnProperty`, spy-object matchers, mock
  clock support, and custom spy strategy APIs out of scope.
- keep custom matcher registration, custom equality testers, custom object
  formatters, and most mutable `jasmine` namespace APIs out of scope.
- keep suite/spec property bags out of scope until the host result contract is
  willing to surface arbitrary user-defined metadata.

#### Slice 9: `jasmine` Proof And Release Readiness

- add compile fixtures for declarations, focused/excluded aliases, hooks,
  callback-less specs, and `fail`.
- add guest and cross-host smoke coverage for declaration shape, matcher
  behavior, and hook ordering through `js`, `wazero`, and `wasmtime`.
- hold `jasmine` to the same proof and documentation bar as `jest` and
  `vitest`; do not accept adapter-only compile proof as sufficient release
  evidence.

### Deferred Adapter Work

#### Slice 10: Deferred `uvu`

- keep `uvu` deferred until after the committed `mocha` and `jasmine` slice
  because `.run()` and the returned suite-builder object still conflict with
  the host-owned `start()` model.
- if `uvu` is revived later, decide explicitly whether `.run()` is a required
  declaration finalizer/no-op or a release blocker before starting adapter
  implementation.
- if `uvu` is revived later, decide whether to preserve the upstream callback
  context shape with `__suite__` and `__test__` crumb fields before adding
  `suite(...)` or the top-level `test` singleton.
- if `uvu` is revived later, start with the low-risk `uvu/assert` subset
  (`ok`, `is`, `equal`, `unreachable`, `not`, `is.not`, `not.equal`) before
  richer thrown-error, regex, constructor, or snapshot-flavored helpers.

- keep `ava` deferred until Promise and async support are strong enough to model
  its real execution semantics coherently.
- keep `tap` and `tape` deferred until the shared runtime is ready to define a
  richer per-test assertion object and plan-driven semantics without host
  contract drift.
