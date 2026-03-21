"use strict";

const WAZERO_PARALLEL_ENV_VAR = "AS_HARNESS_WAZERO_PARALLEL";

function shouldRunWazeroInBand(options = {}) {
	const platform =
		typeof options.platform === "string" ? options.platform : process.platform;
	const env =
		options.env !== null && typeof options.env === "object"
			? options.env
			: process.env;

	if (env[WAZERO_PARALLEL_ENV_VAR] === "1") {
		return false;
	}

	// Linux worker-thread execution through the Node-API-backed wazero host has
	// proven flaky on hosted runners. Default to in-band execution there until the
	// native worker path is stable again.
	return platform === "linux";
}

module.exports = {
	WAZERO_PARALLEL_ENV_VAR,
	shouldRunWazeroInBand,
};
