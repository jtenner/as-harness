#!/usr/bin/env bun

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const textDecoder = new TextDecoder();
const FAIL_MESSAGE_EVENT_KIND = 4;

type SmokeModule = {
  memory: WebAssembly.Memory;
  __start(): void;
  runDeepStrictEqualPass(): void;
  runDeepStrictEqualFailWithMessage(): void;
  runDeepStrictEqualFailWithoutMessage(): void;
};

type FailEvent = {
  kind: number;
  message: string;
};

async function instantiateSmokeModule(
  relativePath: string,
): Promise<{ events: FailEvent[]; exports: SmokeModule }> {
  const wasmBytes = await readFile(new URL(relativePath, import.meta.url));
  const events: FailEvent[] = [];
  let exports: SmokeModule | null = null;

  const instance = await WebAssembly.instantiate(wasmBytes, {
    "as-harness": {
      write_event(kind: number, payloadPtr: number, payloadLen: number): void {
        if (exports === null) {
          throw new Error("Smoke module exports are not ready.");
        }

        const payload = new Uint8Array(
          exports.memory.buffer,
          payloadPtr,
          payloadLen,
        );
        events.push({
          kind,
          message: textDecoder.decode(payload.slice()),
        });
      },
      invoke_staged(): number {
        return 1;
      },
    },
    env: {
      abort(
        messagePtr: number,
        fileNamePtr: number,
        line: number,
        column: number,
      ): void {
        if (exports === null) {
          throw new Error("Smoke module exports are not ready.");
        }

        const memory = new Uint16Array(exports.memory.buffer);
        const readString = (pointer: number): string => {
          if (pointer === 0) {
            return "";
          }

          const start = pointer >>> 1;
          const length = memory[start - 1] >>> 1;
          return String.fromCharCode(...memory.subarray(start, start + length));
        };

        throw new Error(
          `abort: ${readString(messagePtr)} at ${readString(fileNamePtr)}:${line}:${column}`,
        );
      },
    },
  });

  exports = instance.instance.exports as unknown as SmokeModule;
  exports.__start();

  return { events, exports };
}

function expectUnreachableTrap(callback: () => void): void {
  assert.throws(callback, /unreachable|Unreachable/);
}

async function verifySmokeModule(relativePath: string): Promise<void> {
  const { events, exports } = await instantiateSmokeModule(relativePath);

  exports.runDeepStrictEqualPass();
  assert.deepEqual(events, []);

  expectUnreachableTrap(() => {
    exports.runDeepStrictEqualFailWithMessage();
  });
  assert.deepEqual(events, [
    {
      kind: FAIL_MESSAGE_EVENT_KIND,
      message: "deepStrictEqual mismatch",
    },
  ]);

  events.length = 0;
  expectUnreachableTrap(() => {
    exports.runDeepStrictEqualFailWithoutMessage();
  });
  assert.deepEqual(events, []);
}

await verifySmokeModule("../assembly/build/assert-bridge-node-assert.wasm");
await verifySmokeModule("../assembly/build/assert-bridge-node-assert-strict.wasm");
