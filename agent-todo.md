# Harness Todo

## v0.6.0

### Risks

- tag-driven npm publication now depends on the full cross-platform host matrix
  plus the `NPM_TOKEN` secret and annotated tag contents for the notes-only
  GitHub release page; any missing native build target, registry credential, or
  tag summary blocks the public release lane outright.
- temp-project npm install smoke now proves Node for all staged runtimes and
  Bun for the JS harness; native Bun coverage remains package-local because the
  repeated native Bun temp-project subprocess path is not yet stable enough for
  the repo-level install-smoke supervisor.
