export const WAZERO_PARALLEL_ENV_VAR = "AS_HARNESS_WAZERO_PARALLEL";

export function shouldRunWazeroInBand(
	options: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {},
) {
	const platform =
		typeof options.platform === "string" ? options.platform : process.platform;
	const env =
		options.env !== null && typeof options.env === "object"
			? options.env
			: process.env;

	if (env[WAZERO_PARALLEL_ENV_VAR] === "1") {
		return false;
	}

	// Keep Linux on one shared-runner execution slot by default until the native
	// worker-thread path is stable on hosted runners again.
	return platform === "linux";
}
