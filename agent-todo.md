# Harness Todo

## v0.6.0

### Blockers

- resolve the Bun standalone redistribution/compliance path before treating the
  packaged executable release lane as legally complete.

### Risks

- tag-driven npm publication now depends on the full cross-platform host matrix
  plus the `NPM_TOKEN` secret; any missing native build target or registry
  credential blocks the npm lane before the GitHub release publication step.

### Legal And Compliance

- `legal-003` Replace the temporary Bun standalone release gate with a
  documented redistribution path that satisfies Bun's official downstream
  guidance for standalone executables.
