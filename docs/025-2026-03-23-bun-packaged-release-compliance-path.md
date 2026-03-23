# Bun Packaged Release Compliance Path

This document answers: what concrete packaged-release path could `as-harness`
ship without hand-waving the Bun standalone redistribution blocker? The
recommendation is: do not try to make the current `bun build --compile`
single-file executable lane public unless Bun exposes a practical repo-owned
relinkable-object workflow; instead, either keep that lane gated or replace it
with an archive that ships the official Bun binary plus an `as-harness` bundle
and wrapper. This affects release packaging, verification, legal materials,
and the now-retired packaged-release blocker.

This note is a repo-state assessment as of `2026-03-23`.

Historical note: after this note was written, the repo chose the smaller
near-term path documented in
[docs/026-2026-03-23-npm-only-public-release-transition.md](./026-2026-03-23-npm-only-public-release-transition.md):
npm is now the only public installable distribution route, and the packaged Bun
lane is no longer a public release channel.
The later cleanup then removed the standalone-build publication and verification
artifacts from the active repo. References to the deleted standalone-packaging
files below are historical record only.

Repo decision: option 1 below is now the chosen public-release policy. The
other options remain design alternatives only if the repo later decides it
needs downloadable archives again.

This is not legal advice. It is an engineering recommendation based on Bun's
current official documentation and the current `as-harness` release model.

## Question

The repo already:

- stages the legal bundle inside packaged archives
- keeps the packaged Bun release lane gated by default
- documents that the remaining blocker is Bun standalone redistribution

What is still missing is a concrete answer to this question:

- should `as-harness` keep pursuing public `bun build --compile` standalone
  executables
- or should the packaged release lane switch to a different archive model that
  avoids the current downstream standalone obligation problem

## Primary Source Facts

From Bun's official license page:

- Bun itself is MIT-licensed
- Bun statically links JavaScriptCore and WebKit under LGPL-2 terms
- Bun's guidance says that if you statically link an LGPL library, you must
  provide the application in object format so a user can modify the library and
  relink the application
- Bun documents a relink path for Bun itself by rebuilding JavaScriptCore and
  Bun from source

Primary source:

- <https://bun.sh/docs/project/license>

From Bun's single-file executable docs:

- `bun build --compile` generates a standalone binary
- the executable bundles imported files and packages together with a copy of
  the Bun runtime

Primary source:

- <https://bun.sh/docs/bundler/executables>

From Bun's installation docs:

- Bun ships as a single, dependency-free executable
- Bun provides direct binary downloads through its GitHub releases page

Primary source:

- <https://bun.sh/docs/installation>

## Repo-State Interpretation

The historical `as-harness` packaged lane used `bun build --compile`, then
archived the resulting executable through the now-deleted standalone
verification script.

That matters because the release artifact being prepared for public download is
not "our JS code plus a Bun dependency." It is a Bun-produced standalone
executable containing the bundled app together with a copy of the Bun runtime.

Given Bun's current official license guidance, the repo has a practical
engineering problem:

- the current packaged lane does not publish relinkable object-form artifacts
- `bun build --compile` does not currently give this repo a documented
  release-ready object-file handoff that can simply be staged alongside the
  executable
- the repo therefore cannot honestly say it has implemented Bun's documented
  downstream standalone redistribution path

That does not prove that public redistribution is impossible. It does mean the
current repo does not yet have a concrete, reproducible compliance story for
the standalone-executable model.

## Recommendation

Treat the current `bun build --compile` lane as an internal engineering proof,
not as the path to a public packaged release, unless one of these becomes true:

1. Bun documents a downstream standalone redistribution route that this repo can
   follow without maintaining a separate relink/object pipeline for every
   release target.
2. `as-harness` adopts and validates a repo-owned object/relink workflow for
   every packaged target.

Until then, the practical packaged-release recommendation is:

1. keep the current standalone-executable lane gated for public release
2. if packaged releases are still desired, replace the public archive model with
   a Bun-runtime archive instead of a Bun standalone executable

## Recommended Replacement Model

The most viable replacement model from the current Bun docs is:

- ship the official Bun binary for the target platform as a bundled runtime
- ship an `as-harness` JS bundle or staged package payload next to it
- ship a small wrapper (`as-harness`, `as-harness.cmd`, or equivalent) that
  invokes the bundled Bun binary on the shipped entrypoint
- keep the legal bundle in the archive, now explicitly naming Bun as a shipped
  binary component with its version and provenance

Why this is the best candidate:

- Bun's installation docs already describe Bun as a standalone executable that
  is directly downloadable and installable
- that model redistributes Bun as Bun, instead of producing a new Bun-based
  standalone artifact that bundles the application into the executable
- it keeps the user-facing "download an archive and run `as-harness`" story,
  while avoiding the current unresolved relinkable-object story for downstream
  `--compile` executables

This is still a compliance-sensitive distribution lane. The repo would still
need to carry Bun's version, provenance, and bundled legal references
deliberately. But it is a materially cleaner engineering story than pretending
the current single-file standalone binary has already satisfied Bun's stated
downstream conditions.

## Rejected Near-Term Path

Do not treat "include more notice files" as sufficient closure for the current
standalone-executable lane.

That is not the core missing piece anymore. The remaining gap is the relinking
story described by Bun's own license page, not whether the archive contains
enough permissive license texts.

## Required Decision

The repo now needs an explicit product/release decision:

1. keep public packaged releases gated and use npm as the only public
   installable distribution channel for now
2. replace the packaged lane with a Bun-runtime archive model
3. invest in a repo-owned relink/object workflow for Bun standalone executables

Recommendation at the time of writing:

- choose option 1 or 2
- do not choose option 3 unless there is a strong product need for a true
  single-file executable and a willingness to maintain a much heavier release
  pipeline

Chosen repo direction:

- option 1: keep public packaged releases gated and use npm as the only public
  installable distribution channel

## Repo Implications

If the repo chooses option 2, the next implementation slices should be:

- replace `cli/build.ts` release outputs with a Bun-runtime archive staging flow
- emit a bundled JS entrypoint and target-specific launcher scripts
- update `scripts/verify-packaged-cli.ts` to smoke the launcher instead of a
  standalone executable
- refresh the release docs and legal docs to describe Bun as a bundled runtime
  component, not merely the compiler used to make a standalone app
- keep the current standalone gate until the replacement lane is proven

If the repo chooses option 1, the next implementation slice is smaller:

- keep the current gate
- document that npm is the only public installable channel until the packaged
  lane is redesigned

That repo decision has since been implemented by removing packaged Bun artifact
publication from the tag workflow and rewriting the public release docs around
the npm-only channel.

## Related Files

- [agent-todo.md](../agent-todo.md)
- [docs/004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md)
- [docs/023-2026-03-23-license-compliance-audit.md](./023-2026-03-23-license-compliance-audit.md)
- [docs/026-2026-03-23-npm-only-public-release-transition.md](./026-2026-03-23-npm-only-public-release-transition.md)
