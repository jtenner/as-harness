# `harness/wazero`

`harness/wazero` is a standalone Go project that builds a native Node-API
module for the future wazero-backed host runtime.

## Current Scope

The project currently proves out the Go-to-N-API build path:

- a Go `main` package exports a JS-facing `createHarness(bytes)` factory
- `createHarness` compiles the wasm with wazero immediately and stores the
  compiled module for later `run()` use
- a tiny C shim registers the Node-API module
- a local build script resolves the active Node installation headers and emits
  `dist/wazero.node`
- Windows builds resolve `node.lib` from the local Node headers install or
  download the matching import library into `.cache/` when needed
- a smoke test loads the compiled addon with Node's built-in test runner

## API

The addon currently exports:

```ts
type Harness = {
  onNodeFound(callback: (event: unknown) => void): void;
  onNodeStart(callback: (event: unknown) => void): void;
  onNodePass(callback: (event: unknown) => void): void;
  onFailMessage(callback: (event: unknown) => void): void;
  onCallbackStart(callback: (event: unknown) => void): void;
  onCallbackPass(callback: (event: unknown) => void): void;
  run(nodeIndex: Array<number>): boolean;
};

declare function createHarness(
  bytes: Buffer | Uint8Array | ArrayBuffer,
): Harness;
```

`createHarness(...)` rejects invalid wasm before returning a harness.

`run(nodeIndex)` instantiates the compiled module, calls the guest-side
`allocateNodeIndexBuffer(length)` export, writes each `u32` from the provided
NodeIndex into guest memory, and returns `true` on success or `false` on
failure.

The actual traversal/navigation step is still a TODO after the NodeIndex copy.

## Commands

Build the addon:

```bash
node ./scripts/build.mjs
```

Run the smoke test:

```bash
node ./scripts/build.mjs
node --test ./test/smoke.test.cjs
```

Or use the package scripts:

```bash
npm run build
npm test
```

## Notes

- The build is intended to work on Linux, macOS, and Windows.
- The output is a real `.node` binary produced by `go build -buildmode=c-shared`.
- `NODE_API_INCLUDE_DIR`, `NODE_API_LIB_FILE`, and `npm_config_nodedir` can be
  used to point the build at a specific Node headers install.
- Set `AS_HARNESS_SKIP_NODE_LIB_DOWNLOAD=1` to disable the fallback `node.lib`
  download on Windows and require an explicit local import library.
- This is still scaffold-level functionality; the actual wazero runtime bridge
  will replace the placeholder exports as host APIs are defined.
