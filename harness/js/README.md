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
- registered event callbacks receive decoded event objects from the guest
  `write_event` sink, including `NodeFound`, lifecycle events, `FailMessage`,
  and `Diagnostic`

## API

The package exports:

```ts
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
};

declare function createHarness(
  bytes: Buffer | Uint8Array | ArrayBuffer,
): Harness;
```

`createHarness(...)` rejects invalid wasm before returning a harness.

## Commands

Run the smoke test:

```bash
node --test ./test/smoke.host.cjs
```

Or use the package script:

```bash
npm test
```
