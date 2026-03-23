import { resolve } from "node:path";

const sourceCliRepoDir = process.env.AS_HARNESS_SOURCE_CLI_REPO_DIR ?? "";
const npmPackageMode = process.env.AS_HARNESS_NPM_PACKAGE === "1";

export function isNpmPackageMode() {
	return npmPackageMode;
}

export function resolveSourceOrPackageModulePath(options: {
	packageName: string;
	sourceRelativePath: string;
	sourceRepoPath: string[];
}) {
	if (sourceCliRepoDir.length > 0) {
		return resolve(sourceCliRepoDir, ...options.sourceRepoPath);
	}

	if (npmPackageMode) {
		return options.packageName;
	}

	return options.sourceRelativePath;
}
