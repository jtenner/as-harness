import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve, win32 } from "node:path";
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

export type ResolvedHarnessSpecifier =
	| HarnessSpecifier
	| {
			kind: "path";
			value: string;
			resolvedPath: string;
	  }
	| {
			kind: "package";
			value: string;
			resolvedPath: string;
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

function resolveHarnessPath(specifier: string, cwd: string) {
	const resolvedPath = isAbsoluteHarnessPath(specifier)
		? specifier
		: resolve(cwd, specifier);

	if (!existsSync(resolvedPath)) {
		throw new Error(
			`Custom harness path could not be resolved from ${cwd}: ${specifier}`,
		);
	}

	return resolvedPath;
}

function resolveHarnessPackage(specifier: string, cwd: string) {
	const projectRequire = createRequire(
		resolve(cwd, "__as-harness-runtime__.cjs"),
	);

	try {
		return projectRequire.resolve(specifier);
	} catch {
		throw new Error(
			`Custom harness package could not be resolved from ${cwd}: ${specifier}`,
		);
	}
}

export function resolveHarnessSpecifier(
	host: string | undefined,
	cwd: string = process.cwd(),
): ResolvedHarnessSpecifier {
	const harnessSpecifier = classifyHarnessSpecifier(host);
	if (harnessSpecifier.kind === "builtin") {
		return harnessSpecifier;
	}

	if (harnessSpecifier.kind === "path") {
		return {
			...harnessSpecifier,
			resolvedPath: resolveHarnessPath(harnessSpecifier.value, cwd),
		};
	}

	return {
		...harnessSpecifier,
		resolvedPath: resolveHarnessPackage(harnessSpecifier.value, cwd),
	};
}

export function assertSupportedRuntime(
	host: string | undefined,
	cwd: string = process.cwd(),
) {
	const harnessSpecifier = resolveHarnessSpecifier(host, cwd);
	if (harnessSpecifier.kind === "builtin") {
		return;
	}

	if (harnessSpecifier.kind === "path") {
		throw new Error(
			`Custom harness path selectors are not implemented yet: ${harnessSpecifier.value} -> ${harnessSpecifier.resolvedPath}`,
		);
	}

	throw new Error(
		`Custom harness package selectors are not implemented yet: ${harnessSpecifier.value} -> ${harnessSpecifier.resolvedPath}`,
	);
}

export async function resolveRuntime(
	host: string | undefined,
	cwd: string = process.cwd(),
): Promise<Runtime> {
	const harnessSpecifier = resolveHarnessSpecifier(host, cwd);
	assertSupportedRuntime(host, cwd);

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
