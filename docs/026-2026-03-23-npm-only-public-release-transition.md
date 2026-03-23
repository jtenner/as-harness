# Npm-Only Public Release Transition

This document answers: what slices of work are required to remove public
packaged Bun executable publication and make npm the only public installable
distribution route for `as-harness`? The recommendation is: remove packaged
artifact publication from the tag workflow, retire the standalone-packaging
build/test helpers that only existed for `bun build --compile`, move
`assemblyscript` to a consumer-installed peer dependency for the npm CLI, and
keep GitHub releases as notes-only pages derived from annotated tags. This
affects the release workflow, release docs, legal scope, backlog, and
packaging metadata.

This transition plan records the repo decision as of `2026-03-23`.

## Decision

Public installable distribution for `as-harness` is now npm-only.

Implications:

- the tag workflow should publish npm packages, not packaged Bun executables
- the tag workflow may still create or update a notes-only GitHub release page
  from the annotated tag contents
- standalone-packaging build and verification helpers should be retired rather
  than kept as a shadow release lane
- Bun standalone redistribution is no longer a release blocker because the repo
  is no longer trying to publish that artifact class publicly
- `@as-harness/cli` should treat `assemblyscript` as a consumer-installed peer
  dependency instead of a bundled runtime dependency

## Completed Slices

- `npm-only-001` Remove packaged Bun artifact publication from the tag-driven
  release workflow.
- `npm-only-002` Drop the Bun standalone release-policy gate from the public
  tag workflow now that the packaged lane is no longer part of public release.
- `npm-only-003` Rewrite the root, CLI, release-process, and scripts docs so
  they describe npm as the only public installable route, and replace the old
  packaged-release blocker in `agent-todo.md` with the remaining cleanup
  decisions.
- `npm-only-004` Keep tag-driven GitHub releases as notes-only pages and feed
  them from the annotated tag contents instead of packaged assets.
- `npm-only-005` Retire the packaged-only helper scripts, CI jobs, and local
  build metadata (`cli/build.ts`, `verify-packaged-cli.ts`, `release-matrix.ts`,
  `release-manifest.ts`, `stage-release-legal.ts`, related tests, and the old
  packaged CI jobs).
- `npm-only-006` Move `assemblyscript` from a published CLI dependency to a
  consumer-installed peer dependency and prove that path in npm install smoke.

## Recommended Order

1. remove packaged artifact publication from release automation
2. retire the old packaged-build/test helpers and CI jobs
3. switch the published CLI package to the `assemblyscript` peer-dependency
   model
4. rewrite the docs/backlog so the public release story matches the code

## Related Files

- [agent-todo.md](../agent-todo.md)
- [docs/004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md)
- [docs/025-2026-03-23-bun-packaged-release-compliance-path.md](./025-2026-03-23-bun-packaged-release-compliance-path.md)
- [.github/workflows/release.yml](../.github/workflows/release.yml)
- [README.md](../README.md)
- [cli/README.md](../cli/README.md)
- [scripts/README.md](../scripts/README.md)
