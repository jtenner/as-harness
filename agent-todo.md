# Harness Todo

## v0.3.0

### Risks

- packaged release archives now intentionally preserve the inner executable
  basename because current Bun standalone native-addon loading is sensitive to
  renaming the compiled Linux executable.
- future scheduler changes are mostly semantic and order-related, so proof density
  still matters.
- CI, release, and repo-local verification are pinned in `.mise.toml` to
  current upstream Bun/Node/Go/Rust stable releases, so external toolchain
  rollovers still need explicit baseline refreshes here.
- source and bundled `wazero` CLI runtime loading now intentionally diverge:
  source mode loads the built addon directly with a dedicated CJS worker module,
  while packaged mode keeps the bundled extraction path, so future refactors
  need hosted Windows and packaged Linux proof before trying to unify them.
- bundled Linux `wazero` now forces the interpreter engine to avoid the hosted
  packaged createHarness hang, so future work should confirm whether the compiler
  engine can be restored safely.
- packaged verifier builds now get a longer timeout budget than smoke runs, but
  first-time native dependency downloads can still skew hosted CI timing.
