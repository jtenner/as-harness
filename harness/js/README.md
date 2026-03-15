# `harness/js`

`harness/js` is a standalone JavaScript host package that mirrors the current
`harness/wazero` API on top of Node's built-in WebAssembly runtime.

## Current Scope

The package currently provides the same early host bridge surface as
`harness/wazero`:

- `createHarness(bytes)` validates wasm immediately and stores a compiled module
- instantiation is fully in-process; there is no native addon build step
- the host import module includes `invoke_staged()`, which calls back into the
  guest `invoke()` export and converts trap vs normal return into `0` or `1`
- `run(nodeIndex)` stages a host-provided `NodeIndex`, calls the guest-side
  `run()` export, and returns `true` or `false`
- `discover(nodeIndex)` stages a host-provided `NodeIndex`, calls the
  guest-side `discover()` export, and returns whether discovery succeeded
- `start()` performs a full structural discovery pass, schedules both
  per-top-level-branch discovery and per-branch execution onto bounded
  worker-thread pools sized from host parallelism, and resolves raw branch data
  for later reporting
- registered event callbacks receive decoded event objects from the guest
  `write_event` sink, including `NodeFound`, lifecycle events, `FailMessage`,
  and `Diagnostic`

## API

The package exports this API and now ships matching TypeScript declarations:

```ts
type HarnessBytes = Buffer | ArrayBufferView | ArrayBuffer;

type HarnessNode = {
  nodeIndex: Array<number>;
  kind: number;
  declarationMode: number;
  name: string;
};

type HarnessNodeEvent = {
  nodeIndex: Array<number>;
};

type HarnessCallbackEvent = {
  hook: number;
  nodeIndex: Array<number>;
};

type HarnessFailMessageEvent = {
  message: string;
};

type HarnessDiagnosticEvent = {
  nodeIndex: Array<number>;
  message: string;
};

type HarnessEventMap = {
  nodeFound: HarnessNode;
  nodeStart: HarnessNodeEvent;
  nodePass: HarnessNodeEvent;
  failMessage: HarnessFailMessageEvent;
  callbackStart: HarnessCallbackEvent;
  callbackPass: HarnessCallbackEvent;
  diagnostic: HarnessDiagnosticEvent;
};

type HarnessEvent<
  T extends keyof HarnessEventMap = keyof HarnessEventMap,
> = {
  type: T;
  data: HarnessEventMap[T];
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
  onNodeFound(callback: (event: HarnessNode) => void): void;
  onNodeStart(callback: (event: HarnessNodeEvent) => void): void;
  onNodePass(callback: (event: HarnessNodeEvent) => void): void;
  onFailMessage(callback: (event: HarnessFailMessageEvent) => void): void;
  onCallbackStart(callback: (event: HarnessCallbackEvent) => void): void;
  onCallbackPass(callback: (event: HarnessCallbackEvent) => void): void;
  onDiagnostic(callback: (event: HarnessDiagnosticEvent) => void): void;
  callI32(exportName: string): number;
  discover(nodeIndex: Array<number>): boolean;
  run(nodeIndex: Array<number>): boolean;
  start(): Promise<HarnessStartResult>;
};

declare function createHarness(bytes: HarnessBytes): Harness;
```

`createHarness(...)` rejects invalid wasm before returning a harness.

`start()` performs an initial top-level discovery pass, then runs top-level
branch discovery and branch execution through bounded worker-thread pools sized
from host parallelism so its scheduling phases match `harness/wazero`, and
resolves the raw `HarnessStartResult` shape shown above.

## Commands

Run the smoke test:

```bash
node --test ./test/smoke.host.cjs
```

Or use the package script:

```bash
npm test
```
