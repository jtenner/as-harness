# `jasmine` Adapter TODO

Status: thin adapter shipped for the current `v0.4.0` line.

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
