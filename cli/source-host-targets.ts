export type SourceHarness = "js" | "wazero" | "wasmtime";

export type HostValidationTarget = {
	architecture: "arm64" | "x64";
	label: string;
	nodeVersion: string;
	runner: string;
	sourceHarnesses: SourceHarness[];
};

// Node 25 is the explicit current source-host baseline. If the project later
// broadens Node support, expand this constant and the host-validation matrix
// together instead of implicitly relying on whichever Node version the CI
// runners happen to install.
export const SOURCE_HOST_NODE_BASELINE = "25";

// These are the hosted runners where we expect source-based host builds and
// smoke tests to work.
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
