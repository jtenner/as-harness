# Third-Party Notices

This project ships packaged CLI binaries that include or depend on third-party software. This file identifies the third-party components that are part of the current `v0.1.0` release path and points to the corresponding license texts included in this repository.

This file covers third-party notices only. The `as-harness` project itself is licensed under MIT in [LICENSE](/home/jtenner/Projects/as-harness/LICENSE).

## Included Components

### AssemblyScript

- Project: `assemblyscript`
- Version: `0.28.10`
- License: `Apache-2.0`
- Included texts:
  - [licenses/assemblyscript/LICENSE](/home/jtenner/Projects/as-harness/licenses/assemblyscript/LICENSE)
  - [licenses/assemblyscript/NOTICE](/home/jtenner/Projects/as-harness/licenses/assemblyscript/NOTICE)
- Repository: <https://github.com/AssemblyScript/assemblyscript>

### wazero

- Project: `github.com/tetratelabs/wazero`
- Version: `v1.11.0`
- License: `Apache-2.0`
- Included texts:
  - [licenses/wazero/LICENSE](/home/jtenner/Projects/as-harness/licenses/wazero/LICENSE)
  - [licenses/wazero/NOTICE](/home/jtenner/Projects/as-harness/licenses/wazero/NOTICE)
- Repository: <https://github.com/tetratelabs/wazero>

This component is relevant to release artifacts that package the `wazero` host.

### golang.org/x/sys

- Project: `golang.org/x/sys`
- Version: `v0.38.0`
- License: BSD-style license from the Go authors
- Included text:
  - [licenses/golang.org-x-sys/LICENSE](/home/jtenner/Projects/as-harness/licenses/golang.org-x-sys/LICENSE)
- Repository: <https://go.googlesource.com/sys>

This component is relevant to release artifacts that package the `wazero` host.

### Bun Runtime

The packaged standalone executables are built with Bun `1.3.10`. Bun’s own license and third-party licensing information should be reviewed as part of any public binary release:

- <https://bun.sh/docs/project/licensing>

## Dev-Only Tooling

The repo also uses development-only tools such as `@biomejs/biome` and `@types/bun`. Those packages are part of the development environment, but they are not the main third-party components relied on by the shipped release artifacts described above.
