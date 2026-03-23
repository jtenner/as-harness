# Harness Todo

## v0.6.0

### Blockers

- none currently.

### Risks

- The debug payload work must not claim full guest function-call stacks that
  the current AssemblyScript and Wasm trap boundary cannot preserve portably.
- The default compile-wrapper debug rewrite must stay user-overridable and must
  not regress direct non-wrapper `asc` workflows.
- The bundled source rewrite is intentionally syntax-driven today and should
  stay conservative around shadowed local `abort` / `trace` names until there
  is a compiler-owned symbol-resolution hook for this override path.

### Rich Debug Payloads

- `debug-005`: extend CLI and host smoke proof for structured trace and abort
  output, refresh the core ABI / runtime docs for the shipped source-rewrite
  override path, and remove the backlog item.
