import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, extname, isAbsolute, resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";
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

type CustomRuntimeModuleShape = {
	name?: unknown;
	mutateCompilerArguments?: unknown;
	createHarness?: unknown;
};

const RESERVED_HARNESS_PROTOCOLS = [
	"node:",
	"bun:",
	"http:",
	"https:",
] as const;
const SUPPORTED_CUSTOM_HARNESS_EXTENSIONS = [
	".js",
	".cjs",
	".mjs",
	".node",
	".ts",
] as const;

export class HarnessResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HarnessResolutionError";
	}
}

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

function usesReservedHarnessProtocol(host: string) {
	return RESERVED_HARNESS_PROTOCOLS.some((protocol) =>
		host.startsWith(protocol),
	);
}

function isRunningOnBun() {
	return (
		typeof globalThis === "object" &&
		"Bun" in globalThis &&
		globalThis.Bun !== undefined
	);
}

function assertSupportedCustomHarnessRuntime(
	harnessSpecifier: Exclude<ResolvedHarnessSpecifier, { kind: "builtin" }>,
) {
	if (extname(harnessSpecifier.resolvedPath) === ".ts" && !isRunningOnBun()) {
		throw new HarnessResolutionError(
			`Custom TypeScript harness files require Bun: ${harnessSpecifier.value}`,
		);
	}
}

function validateResolvedCustomHarnessFile(
	specifier: string,
	resolvedPath: string,
	selectorKind: "path" | "package",
) {
	const stats = (() => {
		try {
			return statSync(resolvedPath);
		} catch {
			throw new HarnessResolutionError(
				`Custom harness ${selectorKind} could not be resolved: ${specifier}`,
			);
		}
	})();

	if (!stats.isFile()) {
		throw new HarnessResolutionError(
			`Custom harness ${selectorKind} resolved to a directory, expected a file: ${specifier}`,
		);
	}

	const extension = extname(resolvedPath);
	if (
		!(SUPPORTED_CUSTOM_HARNESS_EXTENSIONS as readonly string[]).includes(
			extension,
		)
	) {
		throw new HarnessResolutionError(
			`Custom harness ${selectorKind} uses an unsupported extension: ${specifier} (expected .js, .cjs, .mjs, .node, or .ts)`,
		);
	}
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

	try {
		validateResolvedCustomHarnessFile(specifier, resolvedPath, "path");
	} catch (error) {
		if (
			error instanceof HarnessResolutionError &&
			error.message ===
				`Custom harness path could not be resolved: ${specifier}`
		) {
			throw new HarnessResolutionError(
				`Custom harness path could not be resolved from ${cwd}: ${specifier}`,
			);
		}

		throw error;
	}

	return resolvedPath;
}

function resolveHarnessPackage(specifier: string, cwd: string) {
	if (usesReservedHarnessProtocol(specifier)) {
		throw new HarnessResolutionError(
			`Custom harness selector uses a reserved protocol and must stay local: ${specifier}`,
		);
	}

	const projectRequire = createRequire(
		resolve(cwd, "__as-harness-runtime__.cjs"),
	);

	try {
		const resolvedPath = projectRequire.resolve(specifier);
		validateResolvedCustomHarnessFile(specifier, resolvedPath, "package");
		return resolvedPath;
	} catch (error) {
		if (error instanceof HarnessResolutionError) {
			throw error;
		}

		throw new HarnessResolutionError(
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
		const resolvedSpecifier = {
			...harnessSpecifier,
			resolvedPath: resolveHarnessPath(harnessSpecifier.value, cwd),
		};
		assertSupportedCustomHarnessRuntime(resolvedSpecifier);
		return resolvedSpecifier;
	}

	const resolvedSpecifier = {
		...harnessSpecifier,
		resolvedPath: resolveHarnessPackage(harnessSpecifier.value, cwd),
	};
	assertSupportedCustomHarnessRuntime(resolvedSpecifier);
	return resolvedSpecifier;
}

export function assertSupportedRuntime(
	host: string | undefined,
	cwd: string = process.cwd(),
) {
	resolveHarnessSpecifier(host, cwd);
}

function isCustomRuntimeModuleShape(
	value: unknown,
): value is Required<Pick<Runtime, "createHarness">> &
	Partial<Pick<Runtime, "mutateCompilerArguments" | "name">> {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as CustomRuntimeModuleShape).createHarness === "function"
	);
}

function deriveCustomRuntimeName(
	harnessSpecifier: Exclude<ResolvedHarnessSpecifier, { kind: "builtin" }>,
) {
	if (harnessSpecifier.kind === "package") {
		return harnessSpecifier.value;
	}

	return basename(
		harnessSpecifier.resolvedPath,
		extname(harnessSpecifier.resolvedPath),
	);
}

export function normalizeCustomRuntimeModule(
	harnessSpecifier: Exclude<ResolvedHarnessSpecifier, { kind: "builtin" }>,
	moduleNamespace: Record<string, unknown>,
): Runtime {
	const runtimeCandidate = isCustomRuntimeModuleShape(moduleNamespace.default)
		? moduleNamespace.default
		: isCustomRuntimeModuleShape(moduleNamespace.runtime)
			? moduleNamespace.runtime
			: isCustomRuntimeModuleShape(moduleNamespace)
				? moduleNamespace
				: null;

	if (runtimeCandidate === null) {
		throw new HarnessResolutionError(
			`Custom harness module did not expose a valid createHarness(...) export: ${harnessSpecifier.value}`,
		);
	}

	const name =
		typeof runtimeCandidate.name === "string" &&
		runtimeCandidate.name.length > 0
			? runtimeCandidate.name
			: deriveCustomRuntimeName(harnessSpecifier);
	const mutateCompilerArguments =
		typeof runtimeCandidate.mutateCompilerArguments === "function"
			? runtimeCandidate.mutateCompilerArguments.bind(runtimeCandidate)
			: () => {};

	return {
		name,
		mutateCompilerArguments,
		createHarness: runtimeCandidate.createHarness.bind(runtimeCandidate),
	};
}

async function loadCustomRuntime(
	harnessSpecifier: Exclude<ResolvedHarnessSpecifier, { kind: "builtin" }>,
) {
	try {
		const moduleNamespace = (await import(
			pathToFileURL(harnessSpecifier.resolvedPath).href
		)) as Record<string, unknown>;
		return normalizeCustomRuntimeModule(harnessSpecifier, moduleNamespace);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new HarnessResolutionError(
			`Custom harness module could not be loaded: ${harnessSpecifier.value}. ${message}`,
		);
	}
}

export async function resolveRuntime(
	host: string | undefined,
	cwd: string = process.cwd(),
): Promise<Runtime> {
	const harnessSpecifier = resolveHarnessSpecifier(host, cwd);
	assertSupportedRuntime(host, cwd);

	if (harnessSpecifier.kind !== "builtin") {
		return loadCustomRuntime(harnessSpecifier);
	}

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
