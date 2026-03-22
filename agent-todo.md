# Harness Todo

## v0.4.0

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
  source mode routes both main-thread and worker-thread creation through an
  absolute-path CJS harness module that stages a private addon copy under
  Bun on Windows, while packaged mode keeps the bundled extraction path, so
  future refactors need hosted Windows and packaged Linux proof before trying
  to unify them.
- source-host CLI proof now runs a Bun-built Node-targeted bundle under the
  Node 25 matrix because Bun still has open Windows native-addon crash issues
  on direct source CLI execution; future tooling changes should preserve that
  distinction until the upstream runtime bug is actually gone.
- bundled Linux `wazero` now forces the interpreter engine to avoid the hosted
  packaged createHarness hang, so future work should confirm whether the compiler
  engine can be restored safely.
- packaged verifier builds now get a longer timeout budget than smoke runs, but
  first-time native dependency downloads can still skew hosted CI timing.
