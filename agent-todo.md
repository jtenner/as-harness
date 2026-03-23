# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- do not expand upstream `uvu` `Assertion` object parity until the repo ships
  an adapter-local error-object contract with enough structured failure
  metadata to support future reuse such as Jasmine `throwUnless(...)`.

### Adapter: `uvu`

- add the deferred upstream `Assertion` object-parity work only after that
  shared error-object contract exists.
