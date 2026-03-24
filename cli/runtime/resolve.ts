import { isAbsolute, win32 } from "node:path";
import { jsRuntime } from "./js";
import type { Runtime } from "./types";

export const BUILTIN_HARNESSES = ["js", "wazero", "wasmtime"] as const;

export type BuiltinHarnessName = (typeof BUILTIN_HARNESSES)[number];

export type HarnessSpecifier =
	| {
			kind: "builtin";
			value: BuiltinHarnessName;
	  }
	| {
			kind: "path";
			value: string;
	  }
	| {
			kind: "package";
			value: string;
	  };

function isBuiltinHarnessName(host: string): host is BuiltinHarnessName {
	return (BUILTIN_HARNESSES as readonly string[]).includes(host);
}

function isRelativeHarnessPath(host: string) {
	return (
		host.startsWith("./") ||
		host.startsWith("../") ||
		host.startsWith(".\\") ||
		host.startsWith("..\\")
	);
}

function isAbsoluteHarnessPath(host: string) {
	return isAbsolute(host) || win32.isAbsolute(host);
}

export function classifyHarnessSpecifier(
	host: string | undefined,
): HarnessSpecifier {
	if (host === undefined || host === "js") {
		return {
			kind: "builtin",
			value: "js",
		};
	}

	if (isBuiltinHarnessName(host)) {
		return {
			kind: "builtin",
			value: host,
		};
	}

	if (isRelativeHarnessPath(host) || isAbsoluteHarnessPath(host)) {
		return {
			kind: "path",
			value: host,
		};
	}

	return {
		kind: "package",
		value: host,
	};
}

export function assertSupportedRuntime(host: string | undefined) {
	const harnessSpecifier = classifyHarnessSpecifier(host);
	if (harnessSpecifier.kind === "builtin") {
		return;
	}

	if (harnessSpecifier.kind === "path") {
		throw new Error(
			`Custom harness path selectors are not implemented yet: ${harnessSpecifier.value}`,
		);
	}

	throw new Error(
		`Custom harness package selectors are not implemented yet: ${harnessSpecifier.value}`,
	);
}

export async function resolveRuntime(
	host: string | undefined,
): Promise<Runtime> {
	const harnessSpecifier = classifyHarnessSpecifier(host);
	assertSupportedRuntime(host);

	if (harnessSpecifier.value === "js") {
		return jsRuntime;
	}

	if (harnessSpecifier.value === "wazero") {
		try {
			const { wazeroRuntime } = await import("./wazero");
			return wazeroRuntime;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Harness 'wazero' is not available: ${message}`);
		}
	}

	if (harnessSpecifier.value === "wasmtime") {
		try {
			const { wasmtimeRuntime } = await import("./wasmtime");
			return wasmtimeRuntime;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Harness 'wasmtime' is not available: ${message}`);
		}
	}
}
