#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

type TestModule = {
	memory: WebAssembly.Memory;
	__start(): void;
	invoke(): void;
};

const wasmUrl = new URL("../assembly/build/test-debug.wasm", import.meta.url);
const wasmBytes = await readFile(wasmUrl);
let exports: TestModule | null = null;

const instance = await WebAssembly.instantiate(wasmBytes, {
	"as-harness": {
		write_event(): void {},
		invoke_staged(): number {
			if (exports === null) {
				throw new Error("Assembly test exports are not ready.");
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
				throw new Error("Assembly test exports are not ready.");
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

exports = instance.instance.exports as unknown as TestModule;
exports.__start();
