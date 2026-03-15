# `harness/wazero`

`harness/wazero` is a standalone Go project that builds a native Node-API
module for an early wazero-backed host runtime.

## Current Scope

The project currently proves out the Go-to-N-API build path:

- a Go `main` package exports a JS-facing `createHarness(bytes)` factory
- `createHarness` compiles the wasm with wazero immediately and stores the
  compiled module for later `run()` use
- the host import module now includes `invoke_staged()`, which calls back into
  the guest `invoke()` export and converts trap vs normal return into `0` or `1`
- `run(nodeIndex)` now calls the guest-side `run()` export after staging the
  requested `NodeIndex`, so the host can execute a concrete target path
- `start()` now performs a full structural discovery pass inside the native Go
  addon, sizes a goroutine pool from host CPU count, assigns one top-level
  branch per worker, and resolves raw per-branch discovery/execution data for
  later reporting
- registered event callbacks now receive decoded event objects from the guest
  `write_event` sink, including `NodeFound` during the first discovery slice
  and `Diagnostic` from `t.diagnostic(...)`
- a tiny C shim registers the Node-API module
- a local build script resolves the active Node installation headers and emits
  `dist/wazero.node`
- Windows builds resolve `node.lib` from the local Node headers install or
  download the matching import library into `.cache/` when needed
- a smoke test loads the compiled addon with Node's built-in test runner

## API

The addon currently exports:

```ts
type HarnessNode = {
  nodeIndex: Array<number>;
  kind: number;
  declarationMode: number;
  name: string;
};

type HarnessEvent = {
  type:
    | "nodeFound"
    | "nodeStart"
    | "nodePass"
    | "failMessage"
    | "callbackStart"
    | "callbackPass"
    | "diagnostic";
  data: Record<string, unknown>;
};

type HarnessExecution = {
  node: HarnessNode;
  ok: boolean;
  events: Array<HarnessEvent>;
};

type HarnessBranch = {
  root: HarnessNode;
  discovery: {
    ok: boolean;
    nodes: Array<HarnessNode>;
    testCount: number;
  };
  executions: Array<HarnessExecution>;
  ok: boolean;
};

type HarnessStartResult = {
  ok: boolean;
  discoveryOk: boolean;
  discoveredTestCount: number;
  topLevelNodes: Array<HarnessNode>;
  workerCount: number;
  branches: Array<HarnessBranch>;
};

type Harness = {
  onNodeFound(callback: (event: unknown) => void): void;
  onNodeStart(callback: (event: unknown) => void): void;
  onNodePass(callback: (event: unknown) => void): void;
  onFailMessage(callback: (event: unknown) => void): void;
  onCallbackStart(callback: (event: unknown) => void): void;
  onCallbackPass(callback: (event: unknown) => void): void;
  onDiagnostic(callback: (event: unknown) => void): void;
  callI32(exportName: string): number;
  discover(nodeIndex: Array<number>): boolean;
  run(nodeIndex: Array<number>): boolean;
  start(): Promise<HarnessStartResult>;
};

declare function createHarness(
  bytes: Buffer | Uint8Array | ArrayBuffer,
): Harness;
```

`createHarness(...)` rejects invalid wasm before returning a harness.

`callI32(exportName)` instantiates the compiled module, runs `__start`, calls a
zero-argument `i32` guest export, and returns the `u32` result to JS. This is
currently used by the smoke tests to probe the staged-callback trampoline ABI.

`discover(nodeIndex)` instantiates the compiled module, stages the provided
`NodeIndex`, calls the guest-side `discover()` export, returns `true` when the
guest reported a non-negative discovery result, and returns `false` when the
target path was missing or discovery trapped while replaying the target
callback. Discovery remains structural here: interruption is not treated as a
test pass/fail classification.

`run(nodeIndex)` instantiates the compiled module, calls the guest-side
`allocateNodeIndexBuffer(length)` export, writes each `u32` from the provided
NodeIndex into guest memory, calls the guest-side `run()` export, and returns
`true` when that export returns `1` or `false` on trap, missing export, or a
missing target path.

`start()` returns a real JS `Promise` that resolves to the raw discovery and
execution shape above. The wazero harness owns the scheduling policy: after the
initial top-level discovery pass it caps goroutine fan-out to host CPU count and
lets each worker discover and execute one top-level branch at a time.

## Commands

Build the addon:

```bash
node ./scripts/build.mjs
```

Run the smoke test:

```bash
node ./scripts/build.mjs
node --test ./test/smoke.host.cjs
```

Or use the package scripts:

```bash
npm run build
npm test
```

## Notes

- The build is intended to work on Linux, macOS, and Windows.
- The output is a real `.node` binary produced by `go build -buildmode=c-shared`.
- The host-managed trampoline is intentionally minimal: guest code stages a
  single `() => void`, the host import `invoke_staged()` re-enters guest
  `invoke()`, and wazero treats an inner `unreachable` as a trap that returns
  `0` to the outer guest assertion logic.
- `NODE_API_INCLUDE_DIR`, `NODE_API_LIB_FILE`, and `npm_config_nodedir` can be
  used to point the build at a specific Node headers install.
- Set `AS_HARNESS_SKIP_NODE_LIB_DOWNLOAD=1` to disable the fallback `node.lib`
  download on Windows and require an explicit local import library.
- This is still an early host bridge, not the full eventual runtime. Deeper
  reporting, replay validation, and richer host policy remain
  follow-up work.
