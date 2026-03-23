# Harness Todo

## v0.4.0

### Risks

- guest-provided orchestration metadata can easily blur into guest-owned
  scheduling if the ABI grows new scheduler entrypoints instead of staying on
  discovery metadata plus host-owned `start()`.

## v0.6.0

### Adapter: `uvu`

- keep upstream `Assertion` object parity deferred until the repo ships an
  adapter-local error-object contract with enough structured failure metadata
  to support future reuse such as Jasmine `throwUnless(...)`.
