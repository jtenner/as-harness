const EXECUTABLE_NAME = "as-harness";

export type PackagedHarness = "js" | "wazero";
export type SourceHarness = "js" | "wazero" | "wasmtime";

// Bun's compile-target grammar accepts more strings than the executable docs
// currently list. This matrix sticks to the documented supported targets and
// the explicit x64 SIMD variants Bun accepts for those targets.
export const COMPILE_TARGETS: Bun.Build.CompileTarget[] = [
	"bun-darwin-x64",
	"bun-darwin-x64-baseline",
	"bun-darwin-x64-modern",
	"bun-darwin-arm64",
	"bun-linux-x64",
	"bun-linux-x64-baseline",
	"bun-linux-x64-modern",
	"bun-linux-arm64",
	"bun-linux-x64-musl",
	"bun-linux-x64-baseline-musl",
	"bun-linux-x64-modern-musl",
	"bun-linux-arm64-musl",
	"bun-windows-x64",
	"bun-windows-x64-baseline",
	"bun-windows-x64-modern",
];

export type ReleaseBuildTarget = {
	artifactName: string;
	compileTarget: Bun.Build.CompileTarget;
	packagedHarnesses: PackagedHarness[];
	runner: string;
};

export type HostValidationTarget = {
	architecture: "arm64" | "x64";
	label: string;
	nodeVersion: string;
	runner: string;
	sourceHarnesses: SourceHarness[];
};

// Node 22 is the explicit first supported source-host baseline. If the project
// later broadens Node support, expand this constant and the host-validation
// matrix together instead of implicitly relying on whichever Node version the
// CI runners happen to install.
export const SOURCE_HOST_NODE_BASELINE = "22";

// These are the first release artifacts we actually intend to ship and smoke on
// matching GitHub-hosted runners.
export const RELEASE_BUILD_TARGETS: ReleaseBuildTarget[] = [
	{
		artifactName: "as-harness-bun-darwin-arm64",
		compileTarget: "bun-darwin-arm64",
		packagedHarnesses: ["js", "wazero"],
		runner: "macos-15",
	},
	{
		artifactName: "as-harness-bun-darwin-x64",
		compileTarget: "bun-darwin-x64",
		packagedHarnesses: ["js", "wazero"],
		runner: "macos-15-intel",
	},
	{
		artifactName: "as-harness-bun-linux-arm64",
		compileTarget: "bun-linux-arm64",
		packagedHarnesses: ["js"],
		runner: "ubuntu-24.04-arm",
	},
	{
		artifactName: "as-harness-bun-linux-x64",
		compileTarget: "bun-linux-x64",
		packagedHarnesses: ["js", "wazero"],
		runner: "ubuntu-24.04",
	},
	{
		artifactName: "as-harness-bun-windows-x64",
		compileTarget: "bun-windows-x64",
		packagedHarnesses: ["js"],
		runner: "windows-2025",
	},
];

export const RELEASE_COMPILE_TARGETS = RELEASE_BUILD_TARGETS.map(
	({ compileTarget }) => compileTarget,
);

// These are the hosted runners where we expect source-based host builds and
// smoke tests to work. This matrix is intentionally broader than the packaged
// release matrix because source hosts and packaged CLI artifacts have different
// constraints.
export const HOST_VALIDATION_TARGETS: HostValidationTarget[] = [
	{
		architecture: "x64",
		label: "linux-x64",
		nodeVersion: SOURCE_HOST_NODE_BASELINE,
		runner: "ubuntu-24.04",
		sourceHarnesses: ["js", "wazero", "wasmtime"],
	},
	{
		architecture: "arm64",
		label: "linux-arm64",
		nodeVersion: SOURCE_HOST_NODE_BASELINE,
		runner: "ubuntu-24.04-arm",
		sourceHarnesses: ["js", "wazero", "wasmtime"],
	},
	{
		architecture: "arm64",
		label: "macos-arm64",
		nodeVersion: SOURCE_HOST_NODE_BASELINE,
		runner: "macos-15",
		sourceHarnesses: ["js", "wazero", "wasmtime"],
	},
	{
		architecture: "x64",
		label: "macos-x64",
		nodeVersion: SOURCE_HOST_NODE_BASELINE,
		runner: "macos-15-intel",
		sourceHarnesses: ["js", "wazero", "wasmtime"],
	},
	{
		architecture: "x64",
		label: "windows-x64",
		nodeVersion: SOURCE_HOST_NODE_BASELINE,
		runner: "windows-2025",
		sourceHarnesses: ["js", "wazero", "wasmtime"],
	},
];

export function hostValidationTargetForLabel(label: string) {
	return (
		HOST_VALIDATION_TARGETS.find((target) => target.label === label) ?? null
	);
}

export function releaseBuildTargetForCompileTarget(target: string) {
	return (
		RELEASE_BUILD_TARGETS.find(
			({ compileTarget }) => compileTarget === target,
		) ?? null
	);
}

export function packagedHarnessesForCompileTarget(
	target: string,
): PackagedHarness[] {
	return (
		releaseBuildTargetForCompileTarget(target)?.packagedHarnesses ?? ["js"]
	);
}

export function executableFilenameForTarget(target: string) {
	const extension = target.startsWith("bun-windows-") ? ".exe" : "";
	return `${EXECUTABLE_NAME}${extension}`;
}

export function releaseAssetFilenameForTarget(target: string) {
	return `${EXECUTABLE_NAME}-${target}.tar.gz`;
}
