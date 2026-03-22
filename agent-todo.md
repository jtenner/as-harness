# Harness Todo

## v0.5.0

### Blockers

- decide whether full `uvu` compatibility is acceptable with `.run()` as a
  required compatibility no-op under the host-owned `start()` model.

### Risks

- `uvu` wants a callable suite-builder object with guest-owned runner
  finalization, which still maps less directly onto the current shared runtime
  than the shipped `mocha` and `jasmine` adapter lines.

### Adapter: `uvu`

- keep the shipped `uvu/assert` subset stable while the full `uvu` runner
  surface remains deferred.
- if `uvu` resumes, start with `suite(...)`, the top-level `test` singleton,
  hook registration, `only` / `skip`, and an explicit `.run()` no-op policy.
- keep `exec(...)`, richer assertion helpers, and broader thrown-error or
  snapshot-flavored helpers deferred until the suite-builder contract is
  actually settled.
