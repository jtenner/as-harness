# License Compliance Audit

This document answers: what must change for `as-harness` to be compliant with the licenses of the software it ships, builds against, and redistributes today? The recommendation is: keep the project MIT-licensed, but treat license compliance as a packaging and provenance problem, not a relicensing problem. The highest-risk area is packaged Bun executables; the most obvious missing work is incomplete third-party notice coverage for AssemblyScript's npm dependency closure and for the source-built `wasmtime` host. This affects the root legal files, release packaging, source-host documentation, and future CI policy.

This is a repo-state audit as of `2026-03-23`.

Historical note: this audit captured the repo state immediately before the
first packaging-focused compliance slice landed. That follow-up slice now tracks
the missing `binaryen` and `long` license texts, embeds the legal bundle inside
packaged archives, refreshes the packaged notice/docs, generates the source-build
`wasmtime` inventory, and adds validation that checks the generated legal
artifacts for drift. The remaining open item from this audit is the Bun
standalone redistribution path.

## Scope

This audit covers the software the repository currently redistributes or causes users to build locally:

- project license and package metadata
- packaged CLI artifacts built with Bun
- the bundled AssemblyScript compiler path used by the CLI
- the packaged `wazero` host
- the source-only `wasmtime` host
- the current release/legal staging flow

This audit does not try to answer every possible downstream legal question. It does identify concrete repo changes needed to align the current distribution model with the upstream license terms that are visible from the repo and upstream primary sources.

This is not legal advice. It is an engineering compliance assessment based on the current repo state and upstream license materials.

## Executive Summary

The project's own inbound license mix is generally compatible with keeping `as-harness` under MIT. The main problem is not license incompatibility. The problem is incomplete and inconsistent fulfillment of notice and redistribution obligations.

The current repo already does some useful work:

- the root project is explicitly MIT-licensed in [LICENSE](../LICENSE)
- package manifests declare `MIT`
- the repo tracks license texts for AssemblyScript, wazero, and `golang.org/x/sys`
- the release workflow stages a legal sidecar bundle via [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts)

That is not enough.

The concrete gaps are:

1. `THIRD_PARTY_NOTICES.md` is stale and incomplete.
   It still says the current packaged release path is `v0.1.0`, while [cli/package.json](../cli/package.json) is `0.5.0`.

2. The packaged CLI redistributes more npm code than the notices currently admit.
   The CLI imports `assemblyscript/asc` and `assemblyscript/dist/assemblyscript.js` directly from [cli/as/compile.ts](../cli/as/compile.ts), and the lockfiles show `assemblyscript@0.28.10` depends on `binaryen@123.0.0-nightly.20250530` and `long@5.3.2`. Those are not currently listed or tracked under `licenses/`.

3. Packaged archives do not include legal files inside the archive.
   [scripts/verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts) creates each `tar.gz` from an `install/` directory that only contains the executable. The legal files are staged later as sibling release assets by [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts). That means a user can download an archive without receiving the applicable license texts and notices in the archive itself.

4. Bun is treated as an informational footnote instead of a compliance requirement.
   The current notice file says Bun licensing "should be reviewed." That is too weak for packaged executables built with Bun. Bun's own license page explicitly documents LGPL-style static-linking obligations around JavaScriptCore/WebKit and lists additional statically linked libraries and embedded polyfills.

5. The source-only `wasmtime` host has no tracked third-party license inventory.
   The host is not packaged in release archives today, but the repo explicitly supports building and running it from source on CI and locally. Its dependency closure is much larger and more license-diverse than the current docs imply.

6. There is no automated license drift check.
   If `Cargo.lock`, `go.mod`, `go.sum`, `cli/bun.lock`, or npm lockfiles change, the legal bundle can silently become outdated.

## Current Distribution Map

Understanding what is actually redistributed matters more than reading the dependency lists in isolation.

### Packaged release artifacts

Current packaged release targets are defined in [cli/build-targets.ts](../cli/build-targets.ts):

- `bun-darwin-arm64`: `js`, `wazero`
- `bun-darwin-x64`: `js`, `wazero`
- `bun-linux-arm64`: `js`
- `bun-linux-x64`: `js`, `wazero`
- `bun-windows-x64`: `js`

The packaged archives are produced by [scripts/verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts), which:

- builds a Bun standalone executable through [cli/build.ts](../cli/build.ts)
- copies that executable into a temporary `install/` directory
- archives the `install/` directory as `as-harness-<target>.tar.gz`

Important consequence:

- the archive contains the executable
- the archive does not contain `LICENSE`
- the archive does not contain `THIRD_PARTY_NOTICES.md`
- the archive does not contain third-party license texts

Legal files are only added later as separate release assets by [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts). That is a material compliance weakness because the archive itself is the primary redistributable artifact.

### Source-host-only artifacts

The repo also supports building native source hosts directly:

- `harness/wazero/dist/wazero.node`
- `harness/wasmtime/dist/wasmtime.node`

Per [docs/004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md) and [harness/wasmtime/README.md](../harness/wasmtime/README.md), `wasmtime` is source-only today. That reduces packaged-release exposure, but it does not eliminate the need for accurate repo-level documentation and reproducible license inventory when users build and redistribute those artifacts themselves.

## Project License Compatibility

The project can remain MIT.

Nothing in the currently identified inbound license set forces the project itself to stop being MIT:

- MIT project code is compatible with redistributing Apache-2.0, BSD-style, ISC, zlib, and similar permissive dependencies
- Apache-2.0 inbound code does not require relicensing the whole project as Apache-2.0 when it is kept as a separate dependency and its notices are preserved
- `Apache-2.0 WITH LLVM-exception` is still a permissive inbound license for the relevant Wasmtime family crates
- several Rust dependencies are dual-licensed with permissive alternatives; choosing the permissive branch of an `OR` expression is normal and sufficient if the corresponding license texts are preserved

So the correct engineering response is not "change the project license." It is:

- keep the project MIT
- preserve upstream notices and license texts
- document what is shipped in which artifact class
- stop shipping artifacts whose legal requirements are not actually met

## Existing Legal Assets

The repo currently tracks:

- [licenses/assemblyscript/LICENSE](../licenses/assemblyscript/LICENSE)
- [licenses/assemblyscript/NOTICE](../licenses/assemblyscript/NOTICE)
- [licenses/wazero/LICENSE](../licenses/wazero/LICENSE)
- [licenses/wazero/NOTICE](../licenses/wazero/NOTICE)
- [licenses/golang.org-x-sys/LICENSE](../licenses/golang.org-x-sys/LICENSE)

Those are staged by [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts) as:

- `LICENSE`
- `THIRD_PARTY_NOTICES.md`
- `ASSEMBLYSCRIPT-LICENSE.txt`
- `ASSEMBLYSCRIPT-NOTICE.txt`
- `WAZERO-LICENSE.txt`
- `WAZERO-NOTICE.txt`
- `GOLANG-X-SYS-LICENSE.txt`

This is a reasonable starting point for the `wazero` release path, but it is incomplete for the full packaged CLI and silent on the `wasmtime` source-host path.

## Component-By-Component Findings

## 1. `as-harness` project code

Current state:

- root [LICENSE](../LICENSE) is MIT
- manifests in [package.json](../package.json), [cli/package.json](../cli/package.json), [assembly/package.json](../assembly/package.json), [harness/js/package.json](../harness/js/package.json), [harness/wazero/package.json](../harness/wazero/package.json), and [harness/wasmtime/package.json](../harness/wasmtime/package.json) declare MIT

Assessment:

- good
- no project-license change needed

Required changes:

- none for the project's own license text
- keep package metadata aligned if any new publishable package is introduced

## 2. AssemblyScript and the npm compiler closure

### What the repo actually uses

The CLI imports upstream AssemblyScript code directly in [cli/as/compile.ts](../cli/as/compile.ts):

- `assemblyscript/asc`
- `assemblyscript/dist/assemblyscript.js`
- `assemblyscript/std/assembly/rt/index.d.ts`

That means the packaged CLI is not merely "compatible with AssemblyScript." It actually embeds and executes AssemblyScript compiler/runtime code.

### Versions currently pinned

From [cli/bun.lock](../cli/bun.lock) and [assembly/package-lock.json](../assembly/package-lock.json):

- `assemblyscript@0.28.10`
- `binaryen@123.0.0-nightly.20250530`
- `long@5.3.2`

### Upstream licensing

- AssemblyScript is Apache-2.0 and ships a `NOTICE` file.
  Source: `AssemblyScript/assemblyscript` `LICENSE` and `NOTICE`.
- Binaryen is Apache-2.0.
  Source: `WebAssembly/binaryen` `LICENSE`.
- `long` is Apache-2.0.
  Source: `dcodeIO/long.js` `LICENSE`.

Additional nuance:

- Binaryen's upstream `LICENSE` also points at `third_party/FP16/LICENSE` for code used in that repo. When adding Binaryen legal materials, inspect the exact npm package contents that the CLI redistributes and make sure any bundled third-party license texts shipped by Binaryen itself are mirrored as needed instead of assuming a single `LICENSE` file is always the whole story.

### What the repo already does

The repo already tracks:

- AssemblyScript `LICENSE`
- AssemblyScript `NOTICE`

That is necessary and correct.

### What is missing

The repo does not currently track:

- `binaryen` license text
- `long` license text

This matters because the packaged CLI lockfile clearly includes them, and the CLI's compiler path depends on AssemblyScript internals that, in practice, rely on that npm closure. Treating them as dev-only is not defensible for the packaged CLI.

### AssemblyScript-specific nuance

AssemblyScript's `NOTICE` already includes attribution to Binaryen and other upstream works. That is helpful but not sufficient to treat `binaryen` and `long` as non-issues:

- the packaged CLI is redistributing the npm dependency closure, not just AssemblyScript's own NOTICE narrative
- `binaryen` is a distinct npm package in the locked dependency graph
- `long` is a distinct npm package in the locked dependency graph

### Required changes

Before the next packaged release, add:

- `licenses/binaryen/LICENSE`
- `licenses/long/LICENSE`

Then update:

- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
- [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts)

Recommended notice structure for this section:

- AssemblyScript
- Binaryen
- long

Each entry should include:

- component name
- exact locked version
- license expression
- source URL
- whether it is packaged, source-only, or both
- tracked license file path in this repo

## 3. `wazero` and the Go host

### Versions currently pinned

From [harness/wazero/go.mod](../harness/wazero/go.mod):

- `github.com/tetratelabs/wazero v1.11.0`
- `golang.org/x/sys v0.38.0`

### Upstream licensing

- `wazero` is Apache-2.0 and ships a `NOTICE` file.
  Source: `tetratelabs/wazero` `LICENSE` and `NOTICE`.
- `golang.org/x/sys` uses the Go BSD-style license.
  Source: `golang/sys` `LICENSE`.

### Current repo state

This is the one area the repo already handles reasonably well:

- tracked `wazero` `LICENSE`
- tracked `wazero` `NOTICE`
- tracked `golang.org/x/sys` `LICENSE`
- staged into release assets by [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts)

### Remaining issue

The legal files are only staged as separate assets, not inside the packaged archive that contains the executable. That weakens compliance for the packaged `wazero` targets even though the actual texts are present in the repo.

### Required changes

- keep the existing `wazero` and `x/sys` texts
- include them inside every packaged archive that can execute the `wazero` host
- keep `THIRD_PARTY_NOTICES.md` synchronized with the locked versions

## 4. Bun and standalone packaged executables

This is the highest-risk part of the current release model.

### What the repo does

The release process creates Bun standalone executables through [cli/build.ts](../cli/build.ts), then publishes those executables as the main public distribution artifacts.

### What the current notice file says

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) currently says:

- Bun `1.3.11` is used
- Bun's own license and third-party licensing information "should be reviewed"

That wording is not enough.

### Upstream Bun guidance

Bun's official license page states:

- Bun itself is MIT-licensed
- Bun statically links JavaScriptCore and WebKit under LGPL-2 terms
- if you statically link against an LGPL library, you must provide the application in object form so users can modify the library and relink
- Bun also statically links a long list of other libraries and embeds compatibility polyfills

Primary source:

- <https://bun.sh/docs/project/license>

### Why this is a problem for `as-harness`

The project is not just using Bun as a dev tool. It is publishing Bun-produced standalone executables as release artifacts.

That means the current public release path depends on Bun's downstream redistribution story, not merely Bun's own source-code availability.

The repo currently does not publish, for each packaged release:

- a Bun-specific legal bundle
- relinkable object form for the statically linked executable
- an explicit downstream compliance workflow tied to Bun's documented LGPL-related guidance

### Engineering interpretation

This is the one place in this document where the risk is partly an inference from Bun's published guidance rather than a repo-local mechanical mismatch.

The inference is:

- because `as-harness` distributes Bun standalone executables, the project needs a concrete, documented way to satisfy Bun's documented downstream obligations
- shipping only a final executable plus a few sidecar text files does not appear sufficient

### Minimum required action

Before the next public packaged release, do one of these:

1. Implement and document a Bun-compliant redistribution package.
2. Stop publishing Bun standalone executables until that package exists.

What "implement" should mean in repo terms:

- replace the current "review Bun licensing" note with an explicit compliance section
- track the Bun version in the notice file as a real redistributable component
- include Bun license references and all required bundled-attribution materials in the release bundle
- document the relinking/object-file path required by Bun's official guidance, or document a different officially supported downstream compliance route if Bun now provides one

If no such route is practical for `as-harness`, the safest release policy is:

- no packaged Bun executables
- source-distribution only until legal packaging is solved

That is blunt, but it is better than treating Bun as a harmless footnote when it is the entire packaged executable substrate.

## 5. `wasmtime` source host

### Current repo state

Per [harness/wasmtime/README.md](../harness/wasmtime/README.md) and [docs/004-2026-03-17-release-process.md](./004-2026-03-17-release-process.md):

- `wasmtime` is source-only
- it is validated in CI source-host runs
- it is not currently packaged in public release archives

### Direct dependencies

From [harness/wasmtime/Cargo.toml](../harness/wasmtime/Cargo.toml):

- `anyhow = "1.0.100"` but [harness/wasmtime/Cargo.lock](../harness/wasmtime/Cargo.lock) currently resolves `1.0.102`
- `napi = "2.16.17"`
- `napi-derive = "2.16.13"`
- `wasmtime = "34.0.2"`
- build-dependency `napi-build = "2.3.1"`

### Direct dependency licenses

From `cargo metadata --format-version 1 --locked` run in `harness/wasmtime` on `2026-03-23`:

- `wasmtime@34.0.2`: `Apache-2.0 WITH LLVM-exception`
- `anyhow@1.0.102`: `MIT OR Apache-2.0`
- `napi@2.16.17`: `MIT`
- `napi-derive@2.16.13`: `MIT`
- `napi-build@2.3.1`: `MIT`

Primary sources:

- `bytecodealliance/wasmtime` `Cargo.toml` and `LICENSE`
- `napi-rs/napi-rs` `LICENSE`
- `dtolnay/anyhow` `LICENSE-APACHE` and `LICENSE-MIT`

### Lockfile-wide scale

The `cargo metadata` run reported `186` packages in the locked dependency set. That count is an upper bound across the lockfile and platform-specific edges, not a guarantee that every supported platform build links every single crate. It is still large enough that hand-maintaining notices in prose will not scale.

Unique license expressions observed in that metadata run:

- `Apache-2.0 WITH LLVM-exception`: 34 packages
- `MIT OR Apache-2.0`: 94 packages
- `MIT`: 14 packages
- `Apache-2.0 OR MIT`: 8 packages
- `MIT/Apache-2.0`: 8 packages
- `Unlicense OR MIT`: 5 packages
- plus smaller counts for more specialized expressions

Notable non-trivial expressions observed:

| Package | Version | License expression | Compliance note |
| --- | --- | --- | --- |
| `encoding_rs` | `0.8.35` | `(Apache-2.0 OR MIT) AND BSD-3-Clause` | needs BSD notice text in the chosen inventory |
| `foldhash` | `0.1.5` | `Zlib` | permissive, but separate text still needed in a full bundle |
| `ittapi` | `0.4.0` | `GPL-2.0-only OR BSD-3-Clause` | choose BSD-3-Clause branch, do not represent this as GPL-only |
| `ittapi-sys` | `0.4.0` | `GPL-2.0-only OR BSD-3-Clause` | same as above |
| `linux-raw-sys` | `0.12.1` | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` | choose one permissive branch consistently |
| `mach2` | `0.4.3` | `BSD-2-Clause OR MIT OR Apache-2.0` | choose a permissive branch consistently |
| `r-efi` | `5.3.0` | `MIT OR Apache-2.0 OR LGPL-2.1-or-later` | choose MIT or Apache-2.0 branch |
| `rustix` | `1.1.4` | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` | choose a permissive branch consistently |
| `unicode-ident` | `1.0.24` | `(MIT OR Apache-2.0) AND Unicode-3.0` | include Unicode data license text in a full bundle |
| `wit-bindgen` | `0.51.0` | `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` | still permissive, but more than one text may be relevant depending on chosen branch |

### Why the current repo is not sufficient here

There is currently:

- no tracked `licenses/wasmtime/...` directory
- no source-host notice file for the Rust host
- no generated third-party inventory for the Rust lockfile
- no README section telling downstream builders where the Rust legal bundle comes from

Because `wasmtime` is source-only today, this is not the same release blocker as Bun. But it is still work that needs to happen if the project wants to claim repository-wide license hygiene rather than only packaged-release hygiene.

### Required changes

At minimum:

- create a generated Rust third-party inventory for `harness/wasmtime`
- store or generate the relevant license texts from the locked dependency closure
- document that `wasmtime` is source-only today and therefore not included in packaged release archives

Recommended structure:

- `licenses/wasmtime/` for curated direct-dependency texts plus generated inventory metadata
- a generated Markdown or JSON inventory checked in, or regenerated in CI, from `cargo metadata --locked`

Strong recommendation:

- do not hand-curate the full Rust transitive notice file manually
- generate it from the lockfile and fail CI when the generated output is stale

## 6. Built-in adapter names (`jest`, `mocha`, `vitest`, `uvu`, etc.)

The repo exposes thin built-in adapter surfaces, but the manifests do not show those upstream packages as redistributed runtime dependencies of the CLI. In the current repo state, these look like handwritten compatibility layers, not vendored copies of the upstream projects.

Engineering conclusion:

- no direct third-party notice entry is required solely because the project uses the names of other ecosystems or mimics small API surfaces
- that conclusion would change if the repo begins vendoring upstream code, copying documentation text wholesale, or bundling those packages as dependencies

This is worth documenting because it explains why the notice file should focus on redistributed code, not on every brand name that appears in the README.

## Audit-Time Repo Defects Found

## 1. Stale release version in the notice file

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) says:

- current `v0.1.0` release path

But [cli/package.json](../cli/package.json) is:

- `0.5.0`

Required change:

- update the version references so the notices describe the current release line or stop hard-coding a release number in that file

Recommended fix:

- remove fixed release-version prose from the notice document unless it is generated during release

## 2. Missing npm transitive license texts

Missing from `licenses/`:

- Binaryen
- long

Required change:

- add the texts and stage them in releases

## 3. Release archive lacks legal contents

Current archive behavior from [scripts/verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts):

- archive `install/` directory
- `install/` only contains the executable

Required change:

- include `LICENSE`
- include `THIRD_PARTY_NOTICES.md`
- include all applicable third-party texts inside the archive itself

Best implementation shape:

- create `install/legal/`
- copy the applicable legal bundle into `install/legal/`
- archive that directory together with the executable

## 4. Bun compliance path is unresolved

Current problem:

- notices acknowledge Bun but do not operationalize compliance

Required change:

- either implement a documented Bun redistribution package or suspend packaged Bun releases

## 5. `wasmtime` source-host inventory is absent

Required change:

- add generated inventory and license-text handling for the Rust source-host path

## File-By-File Change List

If the project decides to fix this properly, these are the files that need to change first.

### Must change before the next packaged release

- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
  - fix stale `v0.1.0`
  - add `binaryen`
  - add `long`
  - replace Bun "review later" language with an explicit compliance statement
  - distinguish packaged components from source-only components

- [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts)
  - stage `binaryen` and `long`
  - likely stage a Bun-specific legal bundle or at least Bun-specific documentation

- [scripts/verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts)
  - include legal files inside each archive, not only as sibling assets

- [scripts/release-manifest.ts](../scripts/release-manifest.ts)
  - stop describing the legal bundle as generically "included" if it is only a sidecar
  - reflect the final archive/legal layout accurately

- [.github/workflows/release.yml](../.github/workflows/release.yml)
  - if legal contents move into each archive, keep the workflow order aligned with that packaging shape
  - decide whether sidecar legal files remain in addition to archive-internal copies

- [README.md](../README.md)
  - explain packaged versus source-only legal coverage accurately

- [cli/README.md](../cli/README.md)
  - explain what legal materials ship with packaged executables

- add new tracked files:
  - `licenses/binaryen/LICENSE`
  - `licenses/long/LICENSE`

### Should change for full repo-wide source-build hygiene

- add generated Rust inventory files under `licenses/wasmtime/`
- update [harness/wasmtime/README.md](../harness/wasmtime/README.md) with a legal/compliance note
- optionally add a `licenses/README.md` describing provenance and refresh procedure

## Recommended Policy Split

The repo should stop pretending one notice file covers every scenario equally well. There are at least two materially different compliance contexts:

1. Packaged public release artifacts.
2. Source-built optional hosts.

Recommended policy:

- `THIRD_PARTY_NOTICES.md`
  - only for what is shipped in public packaged releases

- `SOURCE_THIRD_PARTY_NOTICES.md` or generated per-host inventories
  - for `wasmtime` and any future source-only host or contributor build path

For packaged targets, a target-aware legal bundle is ideal, but a stable superset is also acceptable if it is clearly documented. Shipping extra permissive license texts in a packaged archive is usually less risky than shipping too few.

This keeps the packaged release notices concise enough to be correct while still giving source builders a truthful inventory.

## Recommended Automation

Manual maintenance will drift.

Add automated checks for:

- Bun/npm closure
  - compare `cli/bun.lock` against the checked-in npm-related license inventory

- Go closure
  - compare `harness/wazero/go.mod` and `go.sum` against the checked-in Go license inventory

- Rust closure
  - regenerate inventory from `cargo metadata --locked`
  - fail CI if the generated file changes

- release archive validation
  - assert each archived release asset contains:
    - project `LICENSE`
    - `THIRD_PARTY_NOTICES.md`
    - all applicable third-party texts

Recommended principle:

- if a lockfile changes, the legal inventory should usually change in the same PR

## Priority Order

### P0: block the next packaged release on these

- fix `THIRD_PARTY_NOTICES.md`
- add `binaryen` and `long`
- ship legal files inside each packaged archive
- resolve the Bun redistribution path or suspend packaged Bun releases

### P1: do next for repo-wide correctness

- add generated `wasmtime` inventory
- document source-only host legal coverage
- document provenance and refresh procedure for `licenses/`

### P2: future-proofing

- add CI license drift checks
- generate SBOM-style inventory for each distribution class

## Bottom Line

The repo is not far from compliance on the AssemblyScript plus `wazero` side, but it is not done:

- the notices are stale
- the packaged npm closure is under-reported
- the release archive shape is wrong for shipping notices

The repo is substantially under-specified on the Bun and `wasmtime` sides:

- Bun is a packaged-release blocker until the project has an explicit downstream compliance story for Bun-produced executables
- `wasmtime` needs generated source-build inventory before the repo can honestly claim comprehensive third-party license hygiene

## Sources

Repo sources used:

- [LICENSE](../LICENSE)
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
- [README.md](../README.md)
- [cli/package.json](../cli/package.json)
- [cli/bun.lock](../cli/bun.lock)
- [cli/as/compile.ts](../cli/as/compile.ts)
- [cli/build.ts](../cli/build.ts)
- [cli/build-targets.ts](../cli/build-targets.ts)
- [scripts/stage-release-legal.ts](../scripts/stage-release-legal.ts)
- [scripts/verify-packaged-cli.ts](../scripts/verify-packaged-cli.ts)
- [harness/wazero/go.mod](../harness/wazero/go.mod)
- [harness/wasmtime/Cargo.toml](../harness/wasmtime/Cargo.toml)
- [harness/wasmtime/Cargo.lock](../harness/wasmtime/Cargo.lock)
- [harness/wasmtime/README.md](../harness/wasmtime/README.md)

Upstream primary sources used:

- Bun license page: <https://bun.sh/docs/project/license>
- AssemblyScript `LICENSE`: <https://raw.githubusercontent.com/AssemblyScript/assemblyscript/main/LICENSE>
- AssemblyScript `NOTICE`: <https://raw.githubusercontent.com/AssemblyScript/assemblyscript/main/NOTICE>
- Binaryen `LICENSE`: <https://raw.githubusercontent.com/WebAssembly/binaryen/main/LICENSE>
- long `LICENSE`: <https://raw.githubusercontent.com/dcodeIO/long.js/master/LICENSE>
- wazero `LICENSE`: <https://raw.githubusercontent.com/tetratelabs/wazero/main/LICENSE>
- wazero `NOTICE`: <https://raw.githubusercontent.com/tetratelabs/wazero/main/NOTICE>
- `golang.org/x/sys` `LICENSE`: <https://raw.githubusercontent.com/golang/sys/master/LICENSE>
- Wasmtime `Cargo.toml`: <https://raw.githubusercontent.com/bytecodealliance/wasmtime/main/Cargo.toml>
- Wasmtime `LICENSE`: <https://raw.githubusercontent.com/bytecodealliance/wasmtime/main/LICENSE>
- napi-rs `LICENSE`: <https://raw.githubusercontent.com/napi-rs/napi-rs/main/LICENSE>
- anyhow `LICENSE-APACHE`: <https://raw.githubusercontent.com/dtolnay/anyhow/master/LICENSE-APACHE>
- anyhow `LICENSE-MIT`: <https://raw.githubusercontent.com/dtolnay/anyhow/master/LICENSE-MIT>

Local command used for the Rust inventory summary:

```bash
cd harness/wasmtime
cargo metadata --format-version 1 --locked
```

That command was used to derive the direct dependency license expressions, unique license-expression counts, and the `186`-package lockfile-wide upper-bound inventory mentioned above.
