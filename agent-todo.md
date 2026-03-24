# Harness Todo

## v0.6.0

### Risks

- tag-driven npm publication now depends on the full cross-platform host matrix,
  per-package npm trusted publisher configuration that matches
  `.github/workflows/release.yml`, and annotated tag contents for the notes-only
  GitHub release page; any missing native build target, trusted-publisher
  mismatch, or tag summary blocks the public release lane outright.
- temp-project npm install smoke now proves Node for all staged runtimes and
  Bun for the JS harness; native Bun coverage remains package-local because the
  repeated native Bun temp-project subprocess path is not yet stable enough for
  the repo-level install-smoke supervisor.

### Custom Harness Loading

- CH-007 Keep `.ts` custom harness loading explicitly Bun-only and prove the
  Node-bundle fallback [docs/027-2026-03-24-custom-harness-loading-plan.md:152](./docs/027-2026-03-24-custom-harness-loading-plan.md)
- CH-008 Refresh help text, README guidance, and custom-author documentation
  [docs/027-2026-03-24-custom-harness-loading-plan.md:156](./docs/027-2026-03-24-custom-harness-loading-plan.md)
