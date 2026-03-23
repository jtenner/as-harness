# Third-Party Notices

This file identifies the third-party software redistributed in the current
packaged `as-harness` release line.

This file covers packaged release artifacts only:

- Bun-built packaged CLI archives
- the packaged AssemblyScript compiler closure used by the CLI
- the packaged `wazero` host on targets that ship it

This file does not describe every source-only dependency used by contributor
tooling or the source-only `wasmtime` host. The project itself remains MIT
licensed under [LICENSE](./LICENSE).

## Packaged Components

### AssemblyScript

- Project: `assemblyscript`
- Version: `0.28.10`
- License: `Apache-2.0`
- Included texts:
  - [licenses/assemblyscript/LICENSE](./licenses/assemblyscript/LICENSE)
  - [licenses/assemblyscript/NOTICE](./licenses/assemblyscript/NOTICE)
- Repository: <https://github.com/AssemblyScript/assemblyscript>
- Release scope: packaged CLI archives

### Binaryen

- Project: `binaryen`
- Version: `123.0.0-nightly.20250530`
- License: `Apache-2.0`
- Included texts:
  - [licenses/binaryen/LICENSE](./licenses/binaryen/LICENSE)
  - [licenses/binaryen/FP16-LICENSE](./licenses/binaryen/FP16-LICENSE)
- Repository: <https://github.com/WebAssembly/binaryen>
- Release scope: packaged CLI archives through the locked `assemblyscript` npm
  dependency closure

### long

- Project: `long`
- Version: `5.3.2`
- License: `Apache-2.0`
- Included text:
  - [licenses/long/LICENSE](./licenses/long/LICENSE)
- Repository: <https://github.com/dcodeIO/long.js>
- Release scope: packaged CLI archives through the locked `assemblyscript` npm
  dependency closure

### wazero

- Project: `github.com/tetratelabs/wazero`
- Version: `v1.11.0`
- License: `Apache-2.0`
- Included texts:
  - [licenses/wazero/LICENSE](./licenses/wazero/LICENSE)
  - [licenses/wazero/NOTICE](./licenses/wazero/NOTICE)
- Repository: <https://github.com/tetratelabs/wazero>
- Release scope: packaged release targets that bundle the `wazero` host

### golang.org/x/sys

- Project: `golang.org/x/sys`
- Version: `v0.38.0`
- License: BSD-style license from the Go authors
- Included text:
  - [licenses/golang.org-x-sys/LICENSE](./licenses/golang.org-x-sys/LICENSE)
- Repository: <https://go.googlesource.com/sys>
- Release scope: packaged release targets that bundle the `wazero` host

### Bun Runtime

- Project: `bun`
- Version: `1.3.11`
- License: Bun is MIT-licensed and its official licensing page also documents
  the additional third-party licensing and static-link redistribution guidance
  relevant to Bun-produced standalone executables.
- Official licensing guidance:
  - <https://bun.sh/docs/project/license>
- Release scope: every packaged CLI archive

## Packaged Archive Layout

Each packaged CLI archive includes:

- the packaged executable
- `legal/LICENSE`
- `legal/THIRD_PARTY_NOTICES.md`
- the tracked third-party license texts for the packaged release line

The same legal files are also uploaded as sidecar release assets to make review
and diffing easier outside the archive itself.

## Source-Only Components Not Bundled In Packaged Releases

The following repo components are not currently bundled into packaged release
archives and therefore are not listed above as packaged artifacts:

- the Rust `wasmtime` host in [harness/wasmtime](./harness/wasmtime)
- development-only tooling such as `@biomejs/biome` and `@types/bun`

Those components still need their own source-build inventory and compliance
handling, but they are not part of the packaged release artifacts described in
this file.
