import { join } from "node:path";

export const WAZERO_UNAVAILABLE_TARGET = "unavailable";

export const WAZERO_ADDON_TARGETS = [
	"darwin-arm64",
	"darwin-x64",
	"linux-arm64-gnu",
	"linux-x64-gnu",
	"windows-x64",
] as const;

export type WazeroAddonTarget = (typeof WAZERO_ADDON_TARGETS)[number];

const COMPILE_TARGET_TO_WAZERO_ADDON_TARGET: Record<
	string,
	WazeroAddonTarget | typeof WAZERO_UNAVAILABLE_TARGET
> = {
	"bun-darwin-arm64": "darwin-arm64",
	"bun-darwin-x64": "darwin-x64",
	"bun-darwin-x64-baseline": "darwin-x64",
	"bun-darwin-x64-modern": "darwin-x64",
	"bun-linux-arm64": "linux-arm64-gnu",
	"bun-linux-arm64-musl": WAZERO_UNAVAILABLE_TARGET,
	"bun-linux-x64": "linux-x64-gnu",
	"bun-linux-x64-baseline": "linux-x64-gnu",
	"bun-linux-x64-baseline-musl": WAZERO_UNAVAILABLE_TARGET,
	"bun-linux-x64-modern": "linux-x64-gnu",
	"bun-linux-x64-modern-musl": WAZERO_UNAVAILABLE_TARGET,
	"bun-linux-x64-musl": WAZERO_UNAVAILABLE_TARGET,
	"bun-windows-x64": "windows-x64",
	"bun-windows-x64-baseline": "windows-x64",
	"bun-windows-x64-modern": "windows-x64",
};

export function resolveWazeroAddonTargetForCompileTarget(target: string) {
	return (
		COMPILE_TARGET_TO_WAZERO_ADDON_TARGET[target] ?? WAZERO_UNAVAILABLE_TARGET
	);
}

export function resolveCurrentWazeroAddonTarget(
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
) {
	if (platform === "darwin" && arch === "arm64") {
		return "darwin-arm64";
	}

	if (platform === "darwin" && arch === "x64") {
		return "darwin-x64";
	}

	if (platform === "linux" && arch === "arm64") {
		return "linux-arm64-gnu";
	}

	if (platform === "linux" && arch === "x64") {
		return "linux-x64-gnu";
	}

	if (platform === "win32" && arch === "x64") {
		return "windows-x64";
	}

	return null;
}

export function isAvailableWazeroAddonTarget(
	target: string,
): target is WazeroAddonTarget {
	return WAZERO_ADDON_TARGETS.includes(target as WazeroAddonTarget);
}

export function wazeroAddonFilename(target: WazeroAddonTarget) {
	return `${target}.node`;
}

export function wazeroAddonPathFromCliDir(
	cliDir: string,
	target: WazeroAddonTarget,
) {
	return join(cliDir, "n-api", wazeroAddonFilename(target));
}
