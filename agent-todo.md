# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- The debug payload work must not claim full guest function-call stacks that
  the current AssemblyScript and Wasm trap boundary cannot preserve portably.
- The default `--use abort=...` and `--use trace=...` override path must remain
  user-overridable and must not regress direct non-wrapper `asc` workflows.

### Rich Debug Payloads

- `debug-004`: ship bundled `harnessAbort` and `harnessTrace` globals plus
  default compile-wrapper `--use` overrides, while keeping user-specified
  overrides authoritative.
- `debug-005`: extend CLI and host smoke proof for structured trace and abort
  output, refresh the core ABI / runtime docs, and remove the backlog item.
