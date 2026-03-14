#!/usr/bin/env bun

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const textDecoder = new TextDecoder();
const FAIL_MESSAGE_EVENT_KIND = 4;

type SmokeModule = {
  memory: WebAssembly.Memory;
  __start(): void;
  invoke(): void;
  runDeepStrictEqualPass(): void;
  runDeepStrictEqualFailWithMessage(): void;
  runDeepStrictEqualFailWithoutMessage(): void;
  runDefaultAssertPass?(): void;
  runDefaultAssertFailWithMessage?(): void;
  runThrowsPass?(): void;
  runThrowsPassWithInnerFailMessage?(): void;
  runDoesNotThrowPass?(): void;
  runThrowsFailWithMessage?(): void;
  runDoesNotThrowFailWithMessage?(): void;
  runIfErrorPass?(): void;
  runIfErrorFailWithoutMessage?(): void;
  runStrictEqualPass?(): void;
  runStrictNamespaceEqualPass?(): void;
  runStrictEqualFailWithMessage?(): void;
  runStrictNamespaceEqualFailWithMessage?(): void;
  runNotStrictEqualPass?(): void;
  runNotStrictEqualFailWithMessage?(): void;
  runNotDeepStrictEqualPass?(): void;
  runNotDeepStrictEqualFailWithMessage?(): void;
  runOkPass?(): void;
  runOkFailWithMessage?(): void;
  runFailWithMessage?(): void;
  runEqualPass?(): void;
  runEqualFailWithMessage?(): void;
  runNotEqualPass?(): void;
  runNotEqualFailWithMessage?(): void;
  runDeepEqualFailWithMessage?(): void;
  runNotDeepEqualPass?(): void;
  runNotDeepEqualFailWithMessage?(): void;
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
        if (exports === null) {
          throw new Error("Smoke module exports are not ready.");
        }

        try {
          exports.invoke();
          return 1;
        } catch (error) {
          if (
            error instanceof WebAssembly.RuntimeError &&
            /unreachable|Unreachable/.test(error.message)
          ) {
            return 0;
          }

          throw error;
        }
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

function expectNamedPass(
  exports: SmokeModule,
  exportName: keyof SmokeModule,
  events: FailEvent[],
  expectedEvents: FailEvent[] = [],
): void {
  const callback = exports[exportName];
  assert.equal(typeof callback, "function");
  (callback as () => void)();
  assert.deepEqual(events, expectedEvents);
  events.length = 0;
}

function expectNamedFailure(
  exports: SmokeModule,
  exportName: keyof SmokeModule,
  expectedMessage: string | null,
  events: FailEvent[],
): void {
  const callback = exports[exportName];
  assert.equal(typeof callback, "function");
  expectUnreachableTrap(() => {
    (callback as () => void)();
  });
  assert.deepEqual(
    events,
    expectedMessage === null
      ? []
      : [
          {
            kind: FAIL_MESSAGE_EVENT_KIND,
            message: expectedMessage,
          },
        ],
  );
  events.length = 0;
}

async function verifySmokeModule(relativePath: string): Promise<void> {
  const { events, exports } = await instantiateSmokeModule(relativePath);

  expectNamedPass(exports, "runDeepStrictEqualPass", events);
  expectNamedFailure(
    exports,
    "runDeepStrictEqualFailWithMessage",
    "deepStrictEqual mismatch",
    events,
  );
  expectNamedFailure(
    exports,
    "runDeepStrictEqualFailWithoutMessage",
    null,
    events,
  );
  if (typeof exports.runDefaultAssertPass == "function") {
    expectNamedPass(exports, "runDefaultAssertPass", events);
  }
  if (typeof exports.runDefaultAssertFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runDefaultAssertFailWithMessage",
      "assert mismatch",
      events,
    );
  }
  if (typeof exports.runThrowsPass == "function") {
    expectNamedPass(exports, "runThrowsPass", events);
  }
  if (typeof exports.runThrowsPassWithInnerFailMessage == "function") {
    expectNamedPass(exports, "runThrowsPassWithInnerFailMessage", events, [
      {
        kind: FAIL_MESSAGE_EVENT_KIND,
        message: "throws inner mismatch",
      },
    ]);
  }
  if (typeof exports.runDoesNotThrowPass == "function") {
    expectNamedPass(exports, "runDoesNotThrowPass", events);
  }
  if (typeof exports.runIfErrorPass == "function") {
    expectNamedPass(exports, "runIfErrorPass", events);
  }
  if (typeof exports.runThrowsFailWithMessage == "function") {
    expectNamedFailure(exports, "runThrowsFailWithMessage", "throws mismatch", events);
  }
  if (typeof exports.runDoesNotThrowFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runDoesNotThrowFailWithMessage",
      "doesNotThrow mismatch",
      events,
    );
  }
  if (typeof exports.runIfErrorFailWithoutMessage == "function") {
    expectNamedFailure(exports, "runIfErrorFailWithoutMessage", null, events);
  }

  if (typeof exports.runStrictEqualPass == "function") {
    expectNamedPass(exports, "runStrictEqualPass", events);
  }
  if (typeof exports.runStrictNamespaceEqualPass == "function") {
    expectNamedPass(exports, "runStrictNamespaceEqualPass", events);
  }
  if (typeof exports.runOkPass == "function") {
    expectNamedPass(exports, "runOkPass", events);
  }
  if (typeof exports.runStrictEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runStrictEqualFailWithMessage",
      "strictEqual mismatch",
      events,
    );
  }
  if (typeof exports.runStrictNamespaceEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runStrictNamespaceEqualFailWithMessage",
      "strict namespace equal mismatch",
      events,
    );
  }
  if (typeof exports.runNotStrictEqualPass == "function") {
    expectNamedPass(exports, "runNotStrictEqualPass", events);
  }
  if (typeof exports.runNotStrictEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runNotStrictEqualFailWithMessage",
      "notStrictEqual mismatch",
      events,
    );
  }
  if (typeof exports.runNotDeepStrictEqualPass == "function") {
    expectNamedPass(exports, "runNotDeepStrictEqualPass", events);
  }
  if (typeof exports.runNotDeepStrictEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runNotDeepStrictEqualFailWithMessage",
      "notDeepStrictEqual mismatch",
      events,
    );
  }
  if (typeof exports.runOkFailWithMessage == "function") {
    expectNamedFailure(exports, "runOkFailWithMessage", "ok mismatch", events);
  }
  if (typeof exports.runFailWithMessage == "function") {
    expectNamedFailure(exports, "runFailWithMessage", "fail mismatch", events);
  }
  if (typeof exports.runEqualPass == "function") {
    expectNamedPass(exports, "runEqualPass", events);
  }
  if (typeof exports.runEqualFailWithMessage == "function") {
    expectNamedFailure(exports, "runEqualFailWithMessage", "equal mismatch", events);
  }
  if (typeof exports.runNotEqualPass == "function") {
    expectNamedPass(exports, "runNotEqualPass", events);
  }
  if (typeof exports.runNotEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runNotEqualFailWithMessage",
      "notEqual mismatch",
      events,
    );
  }
  if (typeof exports.runDeepEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runDeepEqualFailWithMessage",
      "deepEqual mismatch",
      events,
    );
  }
  if (typeof exports.runNotDeepEqualPass == "function") {
    expectNamedPass(exports, "runNotDeepEqualPass", events);
  }
  if (typeof exports.runNotDeepEqualFailWithMessage == "function") {
    expectNamedFailure(
      exports,
      "runNotDeepEqualFailWithMessage",
      "notDeepEqual mismatch",
      events,
    );
  }
}

await verifySmokeModule("../assembly/build/assert-bridge-node-assert.wasm");
await verifySmokeModule("../assembly/build/assert-bridge-node-assert-strict.wasm");
