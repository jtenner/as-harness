# as-harness

`as-harness` is an AssemblyScript harness project with a Bun-based CLI and multiple host/runtime strategies. The repo currently contains guest-side AssemblyScript runtime code, a pure JavaScript host, an early wazero host exposed through a Node-API addon, and a Bun CLI package that can already compile target-specific executables while the end-to-end test-running product surface is still being finalized.

## What This Repo Is

- An AssemblyScript harness project.
- A Bun-based CLI intended to become the main distribution surface.
- Multiple host/runtime strategies for running the compiled Wasm:
  - a `JS host`
  - a `wazero host`
  - a scaffolded `wasmtime` path

## Repo Map

- `cli/`
  Bun CLI package, AssemblyScript compiler wrapper, bundled support-file generation, and Bun executable build script.
- `assembly/`
  Guest-side AssemblyScript runtime code, framework adapters, and AssemblyScript tests.
- `harness/js/`
  `JS host` package built on the standard JavaScript WebAssembly APIs.
- `harness/wazero/`
  `wazero host` package built as a Go `Node-API addon`.
- `scripts/`
  Root validation and test orchestration scripts.

## Current Status

Implemented today:

- The AssemblyScript package has real guest-side runtime code, internal event serialization, `node:assert` support, and an early `node:test` implementation.
- The `JS host` exists as a working package with smoke tests.
- The `wazero host` exists as a working Go `Node-API addon` package that builds a real `.node` binary and has smoke tests.
- The CLI can discover entry files, list them, compile discovered test entries into Wasm, execute them through the default `JS host`, print basic pass/fail summaries, compile Bun targets with `bun --compile`, and bundle AssemblyScript support files into the executable build.
- The CLI now also accepts an explicit `--harness` override for `js` or `wazero`, and the compiled CLI can now run both harnesses when a matching `wazero` addon is staged for the build target.

Still scaffolded or planned:

- CLI-level runtime selection is only partially wired today; `--harness` exists for `js` and `wazero`, but the broader shipped runtime-selection story is not finished.
- `cli/n-api/` is now the staging area for target-specific `wazero` addons during CLI builds.
- `harness/wasmtime/` is still scaffolded.
- The final packaged single-file distribution story is still an active roadmap item because cross-target release validation and native-addon distribution proof are still incomplete.

## Packaging Strategy

Goal:

- Use a GitHub `build/tag/release` workflow as the `v0.1.0` release channel.
- Ship a simple `single-file Bun executable` per platform as the main distribution artifact.
- Make both the `JS host` and the `wazero host` part of the MVP product story.

Planned MVP shape:

- The `JS host` is the portable baseline and should work without any `target-specific native artifact`.
- The same MVP should also support the `wazero host` where a matching `.node` `Node-API addon` is built and packaged for that target.
- In practice, that means the Bun executable packaging step and the native addon build step must agree on the exact target platform and architecture for the `wazero host` path. The current build direction is one compiled executable per target with build-time-defined addon target and addon path constants so Bun can fold the runtime loader down to the matching `.node` asset.

The repo now proves the local packaged path for both `js` and `wazero`, but it does not yet prove the full packaged MVP across all targets.

For `v0.1.0`, `npm` publication is out of scope. The first release should ship through GitHub release artifacts.

## Do I Need To Compile wazero For Every Target?

Yes, if you ship the `wazero host` path:

- The `.node` `Node-API addon` is a `target-specific native artifact`.
- You need one build per target platform and architecture.
- For `v0.1.0`, Linux support should target `glibc`; `musl` is intentionally out of scope for the first release.

No, if you ship only the pure `JS host` path:

- The host stays in JavaScript plus WebAssembly.
- There is no native addon to rebuild per target.

## What Is Node-API / N-API?

`Node-API` is the stable native addon ABI used by Node-compatible runtimes. It lets a compiled `.node` addon be loaded by Node and Bun through a consistent C ABI. The ABI is stable across Node versions, but the compiled addon is still a platform-specific native binary, so it must be built for each target it will ship on.

## Recommended Near-Term Roadmap

1. Make the product boundary explicit: define the MVP as shipping both the `JS host` and the `wazero host`.
2. Wire the CLI packaging story so the `JS host` is the portable baseline and the `wazero host` is the target-specific native companion path.
3. Add a CI matrix that validates Bun executable builds plus host-package smoke tests for the supported `macOS`, `Windows`, and `Linux` targets, with `arm64` added where host validation proves it.
4. Harden how the `Node-API addon` is bundled, embedded, or extracted for the `wazero host` path.

## Development Commands

```bash
bun validate
bun test
cd cli && bun run build:list-targets
cd cli && bun run build
cd harness/js && npm test
cd harness/wazero && npm test
```

`harness/wazero` also needs a local Go toolchain and Node headers for addon builds.

## Scope Note

These docs describe the current repository state plus the immediate packaging roadmap. They intentionally do not describe speculative future architecture as if it already exists.
