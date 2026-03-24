import { HOST_VALIDATION_TARGETS } from "../cli/source-host-targets";
import { SUPPORTED_NATIVE_TARGETS } from "./stage-npm-packages";

export const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";
export const RELEASE_TAG_PATTERN = "v*";
export const RELEASE_REPOSITORY = "jtenner/as-harness";
export const RELEASE_FULL_SELECTION_LABEL = "linux-x64";
export const TRUSTED_PUBLISHING_MIN_NODE = "22.14.0";
export const TRUSTED_PUBLISHING_MIN_NPM = "11.5.1";
export const COMMON_RELEASE_PACKAGE_NAMES = [
	"@as-harness/shared",
	"@as-harness/js",
	"@as-harness/wazero",
	"@as-harness/wasmtime",
	"@as-harness/cli",
] as const;

export function expectedReleasePackageNames() {
	return [
		...COMMON_RELEASE_PACKAGE_NAMES,
		...SUPPORTED_NATIVE_TARGETS.map(
			(target) => `@as-harness/wazero-${target.packageSuffix}`,
		),
		...SUPPORTED_NATIVE_TARGETS.map(
			(target) => `@as-harness/wasmtime-${target.packageSuffix}`,
		),
	];
}

export function expectedReleaseMatrixLabels() {
	return HOST_VALIDATION_TARGETS.map((target) => target.label).sort();
}

export function expectedNativePackageLabels() {
	return SUPPORTED_NATIVE_TARGETS.map((target) => {
		if (target.os === "darwin") {
			return `macos-${target.cpu}`;
		}

		if (target.os === "win32") {
			return `windows-${target.cpu}`;
		}

		return `${target.os}-${target.cpu}`;
	}).sort();
}

export function expectedTrustedPublisherEntries() {
	return expectedReleasePackageNames().map((packageName) => ({
		packageName,
		repository: RELEASE_REPOSITORY,
		workflowPath: RELEASE_WORKFLOW_PATH,
	}));
}
