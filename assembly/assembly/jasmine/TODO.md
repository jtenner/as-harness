# `jasmine` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.

Repository policy note as of 2026-03-23: adapter work in `assembly/` remains repo-internal rather than a separately published npm package. Public installation is npm-only via `@as-harness/cli`, which expects a consumer-installed `assemblyscript` peer.

Implemented:

- declarations: `describe`, `fdescribe`, `xdescribe`, `it`, `fit`, `xit`
- hooks: `beforeAll`, `afterAll`, `beforeEach`, `afterEach`
- matcher slice: `.not`, `toBe`, `toEqual`, `toBeDefined`, `toBeFalsy`,
  `toBeTruthy`, `toBeNull`, `toBeUndefined`, `toContain`,
  `toBeGreaterThan`, `toBeLessThan`, `toBeNaN`, and `toThrow`
- `fail(...)` and callback-less pending specs
- bundled CLI wiring and cross-host proof through `js`, `wazero`, and
  `wasmtime`

Current non-goals:

- spies and call-tracking assertions
- async/Promise completion helpers
- custom matcher registration
